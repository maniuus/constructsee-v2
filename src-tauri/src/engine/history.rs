use std::collections::VecDeque;

use super::models::{WorkPlan, WbsComponents, WbsNode};

/// Satu perubahan nilai sel pada satu node. Untuk perubahan `unit_price`
/// komponen lama/baru disertakan agar pemulihan eksak (bukan re-balancing
/// aproksimatif, mis. setelah `set_item_price` mengubah distribusi kategori).
#[derive(Debug, Clone)]
pub struct CellChange {
    pub node_id: String,
    pub field: String,
    pub old_value: f64,
    pub new_value: f64,
    pub old_components: Option<WbsComponents>,
    pub new_components: Option<WbsComponents>,
}

/// Node yang dihapus lengkap dengan konteks di mana ia tersemat, agar undo
/// dapat mengembalikan posisi persis di daftar anak induknya.
#[derive(Debug, Clone)]
pub struct RemovedNode {
    pub node: WbsNode,
    /// `None` berarti node adalah root.
    pub parent_id: Option<String>,
    /// Indeks node di `parent.children_ids` (atau di `roots` bila parent None).
    pub index: usize,
    pub work_plan: Option<WorkPlan>,
}

#[derive(Debug, Clone)]
#[allow(clippy::large_enum_variant)]
pub enum ReversibleCommand {
    UpdateCells { entries: Vec<CellChange> },
    AddNode { node: WbsNode },
    RemoveNodes { removed: Vec<RemovedNode> },
    SetOverhead { old_value: f64, new_value: f64 },
    /// Indent/outdent: node dipindah antar induk pada posisi tertentu.
    MoveNode {
        node_id: String,
        /// Deskripsi siap tampil, mis. `Indent "Galian tanah"`.
        name: String,
        from_parent: Option<String>,
        from_index: usize,
        to_parent: Option<String>,
        to_index: usize,
    },
}

impl ReversibleCommand {
    /// Deskripsi singkat untuk panel History.
    pub fn describe(&self) -> String {
        match self {
            ReversibleCommand::UpdateCells { entries } => match entries.as_slice() {
                [one] => format!("Ubah {} · {}", one.field, one.node_id),
                many => format!("Ubah {} sel", many.len()),
            },
            ReversibleCommand::AddNode { node } => format!("Tambah \"{}\"", node.name),
            ReversibleCommand::RemoveNodes { removed } => match removed.as_slice() {
                [one] => format!("Hapus \"{}\"", one.node.name),
                many => format!("Hapus {} baris", many.len()),
            },
            ReversibleCommand::SetOverhead {
                old_value,
                new_value,
            } => format!("Overhead {old_value:.0}% → {new_value:.0}%"),
            ReversibleCommand::MoveNode { name, .. } => name.clone(),
        }
    }
}

/// Riwayat perintah dua tumpukan (undo/redo) dengan batas memori:
/// melebihi batas → entri paling lama dibuang; operasi baru setelah undo
/// memotong tumpukan redo.
pub struct CommandHistory {
    undo: VecDeque<ReversibleCommand>,
    redo: VecDeque<ReversibleCommand>,
    capacity: usize,
}

impl CommandHistory {
    pub fn new(capacity: usize) -> Self {
        Self {
            undo: VecDeque::new(),
            redo: VecDeque::new(),
            capacity,
        }
    }

    pub fn record(&mut self, command: ReversibleCommand) {
        if self.capacity == 0 {
            return;
        }
        self.redo.clear();
        self.undo.push_back(command);
        while self.undo.len() > self.capacity {
            self.undo.pop_front();
        }
    }

    /// Ambil perintah berikutnya untuk di-undo (dari tumpukan undo).
    /// Perintah yang sama harus dikirim balik ke `record_redo` setelah
    /// pembalikannya berhasil dijalankan.
    pub fn take_undo(&mut self) -> Option<ReversibleCommand> {
        self.undo.pop_back()
    }

    /// Ambil perintah berikutnya untuk di-redo (dari tumpukan redo).
    pub fn take_redo(&mut self) -> Option<ReversibleCommand> {
        self.redo.pop_front()
    }

    /// Simpan perintah yang baru saja di-undo ke tumpukan redo.
    pub fn record_redo(&mut self, command: ReversibleCommand) {
        self.redo.push_back(command);
    }

    /// Simpan perintah yang baru saja di-redo kembali ke tumpukan undo.
    pub fn record_redone(&mut self, command: ReversibleCommand) {
        self.undo.push_back(command);
        while self.undo.len() > self.capacity {
            self.undo.pop_front();
        }
    }

    pub fn clear(&mut self) {
        self.undo.clear();
        self.redo.clear();
    }

    pub fn can_undo(&self) -> bool {
        !self.undo.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo.is_empty()
    }

    /// Daftar deskripsi tumpukan undo, urut dari yang paling baru di-undo.
    pub fn undo_descriptions(&self) -> Vec<String> {
        self.undo.iter().rev().map(|command| command.describe()).collect()
    }

    /// Daftar deskripsi tumpukan redo, urut dari yang berikutnya di-redo.
    pub fn redo_descriptions(&self) -> Vec<String> {
        self.redo.iter().map(|command| command.describe()).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> ReversibleCommand {
        ReversibleCommand::SetOverhead {
            old_value: 10.0,
            new_value: 15.0,
        }
    }

    #[test]
    fn record_then_undo_redo_roundtrip() {
        let mut history = CommandHistory::new(10);
        assert!(!history.can_undo());
        assert!(!history.can_redo());

        history.record(sample());
        assert!(history.can_undo());

        let command = history.take_undo().expect("ada entri undo");
        history.record_redo(command);
        assert!(history.can_redo());
        assert!(!history.can_undo());

        let command = history.take_redo().expect("ada entri redo");
        history.record_redone(command);
        assert!(history.can_undo());
        assert!(!history.can_redo());
    }

    #[test]
    fn record_evicts_oldest_beyond_capacity() {
        let mut history = CommandHistory::new(2);
        for value in [1.0, 2.0, 3.0] {
            history.record(ReversibleCommand::SetOverhead {
                old_value: value,
                new_value: value + 1.0,
            });
        }
        // Entri terlama (1.0) sudah terbuang; undo pertama harus 3.0 → 2.0.
        let command = history.take_undo().expect("ada entri");
        match command {
            ReversibleCommand::SetOverhead { old_value, .. } => assert_eq!(old_value, 3.0),
            _ => panic!("perintah salah"),
        }
    }

    #[test]
    fn record_clears_redo() {
        let mut history = CommandHistory::new(10);
        history.record(sample());
        let command = history.take_undo().unwrap();
        history.record_redo(command);
        assert!(history.can_redo());

        history.record(sample());
        assert!(!history.can_redo());
    }

    #[test]
    fn clear_resets_both_stacks() {
        let mut history = CommandHistory::new(10);
        history.record(sample());
        history.clear();
        assert!(!history.can_undo());
        assert!(!history.can_redo());
    }
}
