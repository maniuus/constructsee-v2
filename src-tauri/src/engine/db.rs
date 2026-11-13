use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};

use super::models::{ComponentCost, ComponentItem, WorkPlan, WbsComponents, WbsNode};

type ItemGroups = (Vec<ComponentItem>, Vec<ComponentItem>, Vec<ComponentItem>);

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS wbs_nodes (
    id TEXT PRIMARY KEY,
    parent_id TEXT,
    children_ids TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    volume REAL NOT NULL,
    unit_price REAL NOT NULL,
    total_price REAL NOT NULL,
    is_expanded INTEGER NOT NULL,
    components TEXT NOT NULL DEFAULT '{}',
    method TEXT NOT NULL DEFAULT 'langsung'
);

CREATE TABLE IF NOT EXISTS project_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Resource item ter-normalisasi (1:N). Sumber kebenaran rincian komponen.
CREATE TABLE IF NOT EXISTS node_resource_items (
    node_id TEXT NOT NULL REFERENCES wbs_nodes(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('tenaga', 'bahan', 'alat')),
    ord INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    coefficient REAL NOT NULL DEFAULT 0.0,
    base_price REAL NOT NULL DEFAULT 0.0,
    subtotal REAL GENERATED ALWAYS AS (coefficient * base_price) VIRTUAL,
    PRIMARY KEY (node_id, category, ord)
);

CREATE INDEX IF NOT EXISTS idx_resource_node_cat ON node_resource_items(node_id, category);
CREATE INDEX IF NOT EXISTS idx_resource_name_unit ON node_resource_items(name, unit);

-- Rencana kerja (persistensi sheet Rencana Kerja).
CREATE TABLE IF NOT EXISTS work_plans (
    node_id TEXT PRIMARY KEY REFERENCES wbs_nodes(id) ON DELETE CASCADE,
    num_workers REAL NOT NULL DEFAULT 1.0,
    duration_days REAL NOT NULL DEFAULT 1.0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
"#;

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let conn = Connection::open(path)?;
    let _: String = conn.query_row("PRAGMA journal_mode=WAL", [], |row| row.get(0))?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "wal_autocheckpoint", 1000)?;
    conn.pragma_update(None, "foreign_keys", true)?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    conn.execute_batch(SCHEMA)?;
    let _ = conn.execute(
        "ALTER TABLE wbs_nodes ADD COLUMN components TEXT NOT NULL DEFAULT '{}'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE wbs_nodes ADD COLUMN method TEXT NOT NULL DEFAULT 'langsung'",
        [],
    );
    Ok(conn)
}

fn sync_items(tx: &rusqlite::Transaction, node: &WbsNode) -> rusqlite::Result<()> {
    tx.execute(
        "DELETE FROM node_resource_items WHERE node_id = ?1",
        params![node.id],
    )?;

    let mut stmt = tx.prepare(
        "INSERT INTO node_resource_items (node_id, category, ord, name, unit, coefficient, base_price)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )?;

    let groups: [(&str, &ComponentCost); 3] = [
        ("tenaga", &node.components.tenaga),
        ("bahan", &node.components.bahan),
        ("alat", &node.components.alat),
    ];

    for (category, component) in groups {
        for (ord, item) in component.items.iter().enumerate() {
            stmt.execute(params![
                node.id,
                category,
                ord as i64,
                item.name,
                item.unit,
                item.coefficient,
                item.base_price,
            ])?;
        }
    }

    Ok(())
}

pub fn load(conn: &mut Connection) -> rusqlite::Result<(Vec<WbsNode>, Vec<String>)> {
    let mut nodes: Vec<WbsNode> = {
        let mut stmt = conn.prepare(
            "SELECT id, parent_id, children_ids, code, name, unit, volume, unit_price, total_price, is_expanded, components, method FROM wbs_nodes",
        )?;

        let rows = stmt.query_map([], |row| {
            let children_raw: String = row.get(2)?;
            let components_raw: String = row.get(10)?;
            let mut node = WbsNode {
                id: row.get(0)?,
                parent_id: row.get(1)?,
                children_ids: serde_json::from_str(&children_raw).unwrap_or_default(),
                code: row.get(3)?,
                name: row.get(4)?,
                unit: row.get(5)?,
                volume: row.get(6)?,
                unit_price: row.get(7)?,
                total_price: row.get(8)?,
                is_expanded: row.get::<_, i64>(9)? != 0,
                components: serde_json::from_str(&components_raw).unwrap_or_default(),
                method: row.get(11)?,
            };

            if node.children_ids.is_empty() {
                if node.components.total() <= f64::EPSILON {
                    if node.unit_price > 0.0 {
                        node.components = WbsComponents::from_unit_price(node.unit_price);
                    }
                } else {
                    node.components.backfill_items();
                }
            } else {
                node.components = WbsComponents::default();
            }

            Ok(node)
        })?;

        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };

    // Normalized resource items -> rakit ulang komponen per node.
    let mut items_by_node: std::collections::HashMap<String, ItemGroups> =
        std::collections::HashMap::new();
    let mut item_count: i64 = 0;
    {
        let mut stmt = conn.prepare(
            "SELECT node_id, category, name, unit, coefficient, base_price
             FROM node_resource_items ORDER BY node_id, category, ord",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                ComponentItem {
                    name: row.get(2)?,
                    unit: row.get(3)?,
                    coefficient: row.get(4)?,
                    base_price: row.get(5)?,
                    subtotal: 0.0,
                },
            ))
        })?;

        for row in rows {
            let (node_id, category, mut item) = row?;
            item.subtotal = item.coefficient * item.base_price;
            item_count += 1;
            let entry = items_by_node.entry(node_id).or_default();
            match category.as_str() {
                "tenaga" => entry.0.push(item),
                "bahan" => entry.1.push(item),
                _ => entry.2.push(item),
            }
        }
    }

    for node in nodes.iter_mut() {
        if node.children_ids.is_empty() {
            if let Some((tenaga, bahan, alat)) = items_by_node.remove(&node.id) {
                node.components = WbsComponents {
                    tenaga: ComponentCost::from_items(tenaga),
                    bahan: ComponentCost::from_items(bahan),
                    alat: ComponentCost::from_items(alat),
                };
            }
        }
    }

    // Migrasi satu kali: bila tabel items masih kosong, isi dari komponen
    // (JSON lama / hasil backfill) agar penyimpanan ter-normalisasi.
    if item_count == 0 {
        let tx = conn.transaction()?;
        for node in &nodes {
            let has_items = !node.components.tenaga.items.is_empty()
                || !node.components.bahan.items.is_empty()
                || !node.components.alat.items.is_empty();
            if node.children_ids.is_empty() && has_items {
                sync_items(&tx, node)?;
            }
        }
        tx.commit()?;
    }

    let roots_raw: Option<String> = conn
        .query_row("SELECT value FROM project_meta WHERE key = 'roots'", [], |row| {
            row.get(0)
        })
        .optional()?;

    let roots = roots_raw
        .and_then(|raw| serde_json::from_str::<Vec<String>>(&raw).ok())
        .filter(|roots| !roots.is_empty())
        .unwrap_or_else(|| {
            nodes
                .iter()
                .filter(|node| node.parent_id.is_none())
                .map(|node| node.id.clone())
                .collect()
        });

    Ok((nodes, roots))
}

pub fn replace_all(
    conn: &mut Connection,
    nodes: &[WbsNode],
    roots: &[String],
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM node_resource_items", [])?;
    tx.execute("DELETE FROM work_plans", [])?;
    tx.execute("DELETE FROM wbs_nodes", [])?;

    {
        let mut stmt = tx.prepare(
            "INSERT INTO wbs_nodes (id, parent_id, children_ids, code, name, unit, volume, unit_price, total_price, is_expanded, components, method) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        )?;
        for node in nodes {
            stmt.execute(params![
                node.id,
                node.parent_id,
                serde_json::to_string(&node.children_ids).unwrap_or_else(|_| "[]".into()),
                node.code,
                node.name,
                node.unit,
                node.volume,
                node.unit_price,
                node.total_price,
                node.is_expanded as i64,
                "{}",
                node.method,
            ])?;
        }
    }

    for node in nodes {
        if node.children_ids.is_empty() {
            sync_items(&tx, node)?;
        }
    }

    tx.execute(
        "INSERT INTO project_meta (key, value) VALUES ('roots', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![serde_json::to_string(roots).unwrap_or_else(|_| "[]".into())],
    )?;
    tx.commit()
}

pub fn delete_ids(conn: &mut Connection, ids: &[String]) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    {
        let mut del_items = tx.prepare("DELETE FROM node_resource_items WHERE node_id = ?1")?;
        let mut del_plan = tx.prepare("DELETE FROM work_plans WHERE node_id = ?1")?;
        let mut del_node = tx.prepare("DELETE FROM wbs_nodes WHERE id = ?1")?;
        for id in ids {
            del_items.execute(params![id])?;
            del_plan.execute(params![id])?;
            del_node.execute(params![id])?;
        }
    }
    tx.commit()
}

pub fn save_roots(conn: &Connection, roots: &[String]) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO project_meta (key, value) VALUES ('roots', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![serde_json::to_string(roots).unwrap_or_else(|_| "[]".into())],
    )?;
    Ok(())
}

pub fn load_setting(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM project_meta WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .optional()
    .ok()
    .flatten()
}

pub fn save_setting(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO project_meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn load_work_plans(conn: &Connection) -> rusqlite::Result<Vec<WorkPlan>> {
    let mut stmt = conn.prepare("SELECT node_id, num_workers, duration_days FROM work_plans")?;
    let rows = stmt.query_map([], |row| {
        Ok(WorkPlan {
            node_id: row.get(0)?,
            num_workers: row.get(1)?,
            duration_days: row.get(2)?,
        })
    })?;
    rows.collect()
}

pub fn upsert_work_plan(conn: &Connection, plan: &WorkPlan) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO work_plans (node_id, num_workers, duration_days, updated_at)
         VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
         ON CONFLICT(node_id) DO UPDATE SET
            num_workers = excluded.num_workers,
            duration_days = excluded.duration_days,
            updated_at = CURRENT_TIMESTAMP",
        params![plan.node_id, plan.num_workers, plan.duration_days],
    )?;
    Ok(())
}

pub fn upsert_many(conn: &mut Connection, nodes: &[WbsNode]) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO wbs_nodes (id, parent_id, children_ids, code, name, unit, volume, unit_price, total_price, is_expanded, components, method)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
             ON CONFLICT(id) DO UPDATE SET
                parent_id = excluded.parent_id,
                children_ids = excluded.children_ids,
                code = excluded.code,
                name = excluded.name,
                unit = excluded.unit,
                volume = excluded.volume,
                unit_price = excluded.unit_price,
                total_price = excluded.total_price,
                is_expanded = excluded.is_expanded,
                components = excluded.components,
                method = excluded.method",
        )?;
        for node in nodes {
            stmt.execute(params![
                node.id,
                node.parent_id,
                serde_json::to_string(&node.children_ids).unwrap_or_else(|_| "[]".into()),
                node.code,
                node.name,
                node.unit,
                node.volume,
                node.unit_price,
                node.total_price,
                node.is_expanded as i64,
                "{}",
                node.method,
            ])?;
        }
    }

    for node in nodes {
        sync_items(&tx, node)?;
    }

    tx.commit()
}

/// Hapus seluruh isi proyek (node, resource, rencana kerja, metadata) tanpa
/// menyentuh skema. Dipakai oleh command `new_project`.
pub fn clear_project(conn: &mut Connection) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM node_resource_items", [])?;
    tx.execute("DELETE FROM work_plans", [])?;
    tx.execute("DELETE FROM wbs_nodes", [])?;
    tx.execute("DELETE FROM project_meta", [])?;
    tx.commit()
}

/// Kolom-kolom tabel `name` pada skema `src` yang ter-attach (kosong bila
/// tabel tidak ada).
fn src_columns(conn: &Connection, table: &str) -> rusqlite::Result<Vec<String>> {
    let mut stmt = conn.prepare(&format!("PRAGMA src.table_info({table})"))?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    rows.collect()
}

/// Kolom wajib `wbs_nodes` pada file proyek. `components` dan `method`
/// opsional (file versi lama) dan diisi default bila tidak ada.
const REQUIRED_NODE_COLUMNS: [&str; 10] = [
    "id",
    "parent_id",
    "children_ids",
    "code",
    "name",
    "unit",
    "volume",
    "unit_price",
    "total_price",
    "is_expanded",
];

/// Salin seluruh isi proyek dari file `.csee` (SQLite) ke koneksi aktif.
/// Data proyek saat ini diganti sepenuhnya — tetapi hanya bila file sumber
/// valid dan seluruh penyalinan berhasil (satu transaksi; gagal → data
/// proyek aktif tidak tersentuh).
pub fn import_project(conn: &mut Connection, path: &Path) -> Result<(), String> {
    if !path.is_file() {
        return Err(format!("File proyek tidak ditemukan: {}", path.display()));
    }

    let source = path.to_string_lossy().to_string();
    conn.execute("ATTACH DATABASE ?1 AS src", params![source])
        .map_err(|error| format!("Gagal membuka file proyek: {error}"))?;

    let result = copy_from_attached(conn);

    let _ = conn.execute("DETACH DATABASE src", []);
    result
}

fn copy_from_attached(conn: &mut Connection) -> Result<(), String> {
    let not_project = |detail: String| {
        format!("File bukan proyek ConstrucSee yang valid ({detail}). Proyek aktif tidak diubah.")
    };

    // Validasi skema sumber sebelum menyentuh data aktif. Membaca skema
    // juga memastikan file benar-benar database SQLite.
    let node_columns = src_columns(conn, "wbs_nodes").map_err(|error| not_project(error.to_string()))?;
    if node_columns.is_empty() {
        return Err(not_project("tabel wbs_nodes tidak ada".to_string()));
    }
    if let Some(missing) = REQUIRED_NODE_COLUMNS
        .iter()
        .find(|column| !node_columns.iter().any(|existing| existing == *column))
    {
        return Err(not_project(format!("kolom wbs_nodes.{missing} tidak ada")));
    }
    let has_items = !src_columns(conn, "node_resource_items")
        .map_err(|error| error.to_string())?
        .is_empty();
    let has_plans = !src_columns(conn, "work_plans")
        .map_err(|error| error.to_string())?
        .is_empty();
    let has_meta = !src_columns(conn, "project_meta")
        .map_err(|error| error.to_string())?
        .is_empty();

    let components_expr = if node_columns.iter().any(|column| column == "components") {
        "components"
    } else {
        "'{}'"
    };
    let method_expr = if node_columns.iter().any(|column| column == "method") {
        "method"
    } else {
        "'langsung'"
    };

    let tx = conn.transaction().map_err(|error| error.to_string())?;
    let copy = (|| -> rusqlite::Result<()> {
        tx.execute("DELETE FROM node_resource_items", [])?;
        tx.execute("DELETE FROM work_plans", [])?;
        tx.execute("DELETE FROM wbs_nodes", [])?;
        tx.execute("DELETE FROM project_meta", [])?;
        tx.execute(
            &format!(
                "INSERT INTO wbs_nodes (id, parent_id, children_ids, code, name, unit, volume, unit_price, total_price, is_expanded, components, method)
                 SELECT id, parent_id, children_ids, code, name, unit, volume, unit_price, total_price, is_expanded, {components_expr}, {method_expr} FROM src.wbs_nodes"
            ),
            [],
        )?;
        if has_items {
            tx.execute(
                "INSERT INTO node_resource_items (node_id, category, ord, name, unit, coefficient, base_price)
                 SELECT node_id, category, ord, name, unit, coefficient, base_price FROM src.node_resource_items",
                [],
            )?;
        }
        if has_plans {
            tx.execute(
                "INSERT INTO work_plans (node_id, num_workers, duration_days)
                 SELECT node_id, num_workers, duration_days FROM src.work_plans",
                [],
            )?;
        }
        if has_meta {
            tx.execute(
                "INSERT INTO project_meta (key, value) SELECT key, value FROM src.project_meta",
                [],
            )?;
        }
        Ok(())
    })();

    match copy {
        Ok(()) => tx.commit().map_err(|error| error.to_string()),
        // Drop `tx` tanpa commit → rollback otomatis; data aktif utuh.
        Err(error) => Err(format!(
            "Gagal menyalin file proyek: {error}. Proyek aktif tidak diubah."
        )),
    }
}

/// Ekspor proyek aktif ke file `.csee` memakai `VACUUM INTO` (snapshot
/// konsisten). Ditulis ke file sementara lalu di-rename, sehingga file
/// simpanan lama tetap utuh bila penulisan gagal.
pub fn export_project(conn: &Connection, path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
    }

    let mut tmp_name = path
        .file_name()
        .map(|name| name.to_os_string())
        .unwrap_or_else(|| "project.csee".into());
    tmp_name.push(".tmp");
    let tmp_path = path.with_file_name(tmp_name);
    if tmp_path.exists() {
        std::fs::remove_file(&tmp_path).map_err(|error| error.to_string())?;
    }

    let written = conn
        .execute(
            "VACUUM INTO ?1",
            params![tmp_path.to_string_lossy().to_string()],
        )
        .map_err(|error| format!("Gagal menulis file proyek: {error}"))
        .and_then(|_| {
            // std::fs::rename menimpa tujuan secara atomik (Windows:
            // MoveFileEx + REPLACE_EXISTING).
            std::fs::rename(&tmp_path, path)
                .map_err(|error| format!("Gagal mengganti file proyek: {error}"))
        });

    if written.is_err() {
        let _ = std::fs::remove_file(&tmp_path);
    }
    written
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::seed;

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "constructsee-db-test-{tag}-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).expect("temp dir");
        dir
    }

    fn seeded(path: &Path) -> Connection {
        let mut conn = open(path).expect("open db");
        let (nodes, roots) = seed::sample();
        replace_all(&mut conn, &nodes, &roots).expect("seed");
        conn
    }

    fn node_count(conn: &Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM wbs_nodes", [], |row| row.get(0))
            .expect("count")
    }

    #[test]
    fn import_invalid_file_keeps_active_project() {
        let dir = temp_dir("invalid");
        let mut conn = seeded(&dir.join("active.db"));
        let before = node_count(&conn);
        assert!(before > 0);

        // Bukan SQLite sama sekali.
        let garbage = dir.join("garbage.csee");
        std::fs::write(&garbage, b"this is not a sqlite database").unwrap();
        assert!(import_project(&mut conn, &garbage).is_err());
        assert_eq!(node_count(&conn), before);

        // SQLite valid, tetapi bukan file proyek.
        let foreign = dir.join("foreign.db");
        Connection::open(&foreign)
            .unwrap()
            .execute_batch("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT);")
            .unwrap();
        assert!(import_project(&mut conn, &foreign).is_err());
        assert_eq!(node_count(&conn), before);

        // Koneksi tetap bisa dipakai (src sudah di-detach).
        save_setting(&conn, "overhead", "12").unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn import_legacy_file_without_method_column() {
        let dir = temp_dir("legacy");
        let mut conn = seeded(&dir.join("active.db"));

        let legacy = dir.join("legacy.csee");
        Connection::open(&legacy)
            .unwrap()
            .execute_batch(
                "CREATE TABLE wbs_nodes (id TEXT PRIMARY KEY, parent_id TEXT, children_ids TEXT NOT NULL,
                    code TEXT NOT NULL, name TEXT NOT NULL, unit TEXT NOT NULL, volume REAL NOT NULL,
                    unit_price REAL NOT NULL, total_price REAL NOT NULL, is_expanded INTEGER NOT NULL);
                 INSERT INTO wbs_nodes VALUES ('legacy-1', NULL, '[]', '1', 'Lama', 'm3', 2.0, 500.0, 1000.0, 0);",
            )
            .unwrap();

        import_project(&mut conn, &legacy).expect("legacy import");
        let (nodes, roots) = load(&mut conn).expect("load");
        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0].method, "langsung");
        assert_eq!(roots, vec!["legacy-1".to_string()]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn export_then_import_roundtrip_and_overwrite() {
        let dir = temp_dir("roundtrip");
        let conn = seeded(&dir.join("active.db"));
        let expected = node_count(&conn);
        let target = dir.join("project.csee");

        export_project(&conn, &target).expect("first save");
        // Simpan ulang ke path yang sama harus menimpa file lama.
        export_project(&conn, &target).expect("second save");
        assert!(!dir.join("project.csee.tmp").exists());

        let mut other = open(&dir.join("other.db")).expect("open other");
        import_project(&mut other, &target).expect("import");
        assert_eq!(node_count(&other), expected);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
