use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ComponentItem {
    pub name: String,
    pub unit: String,
    pub coefficient: f64,
    pub base_price: f64,
    pub subtotal: f64,
}

impl ComponentItem {
    fn scaled(&self, factor: f64) -> Self {
        let base_price = self.base_price * factor;
        Self {
            name: self.name.clone(),
            unit: self.unit.clone(),
            coefficient: self.coefficient,
            base_price,
            subtotal: self.coefficient * base_price,
        }
    }
}

struct ItemTemplate {
    name: &'static str,
    unit: &'static str,
    coefficient: f64,
    weight: f64,
}

const TENAGA_ITEMS: &[ItemTemplate] = &[
    ItemTemplate {
        name: "Pekerja",
        unit: "OH",
        coefficient: 0.200,
        weight: 0.45,
    },
    ItemTemplate {
        name: "Tukang",
        unit: "OH",
        coefficient: 0.100,
        weight: 0.33,
    },
    ItemTemplate {
        name: "Kepala Tukang",
        unit: "OH",
        coefficient: 0.030,
        weight: 0.12,
    },
    ItemTemplate {
        name: "Mandor",
        unit: "OH",
        coefficient: 0.020,
        weight: 0.10,
    },
];

const BAHAN_ITEMS: &[ItemTemplate] = &[
    ItemTemplate {
        name: "Material Utama",
        unit: "ls",
        coefficient: 0.700,
        weight: 0.72,
    },
    ItemTemplate {
        name: "Material Pendukung",
        unit: "ls",
        coefficient: 0.300,
        weight: 0.28,
    },
];

const ALAT_ITEMS: &[ItemTemplate] = &[
    ItemTemplate {
        name: "Alat Berat",
        unit: "jam",
        coefficient: 0.120,
        weight: 0.70,
    },
    ItemTemplate {
        name: "Alat Bantu",
        unit: "jam",
        coefficient: 0.060,
        weight: 0.30,
    },
];

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ComponentCost {
    pub coefficient: f64,
    pub base_price: f64,
    pub subtotal: f64,
    #[serde(default)]
    pub items: Vec<ComponentItem>,
}

impl ComponentCost {
    fn from_share(share: f64, templates: &[ItemTemplate]) -> Self {
        let items: Vec<ComponentItem> = templates
            .iter()
            .map(|template| {
                let subtotal = share * template.weight;
                let base_price = if template.coefficient > 0.0 {
                    subtotal / template.coefficient
                } else {
                    0.0
                };
                ComponentItem {
                    name: template.name.to_string(),
                    unit: template.unit.to_string(),
                    coefficient: template.coefficient,
                    base_price,
                    subtotal,
                }
            })
            .collect();

        let coefficient: f64 = items.iter().map(|item| item.coefficient).sum();
        let subtotal: f64 = items.iter().map(|item| item.subtotal).sum();

        Self {
            coefficient,
            base_price: if coefficient > 0.0 {
                subtotal / coefficient
            } else {
                0.0
            },
            subtotal,
            items,
        }
    }

    fn scaled(&self, factor: f64) -> Self {
        let items: Vec<ComponentItem> =
            self.items.iter().map(|item| item.scaled(factor)).collect();
        let base_price = self.base_price * factor;
        Self {
            coefficient: self.coefficient,
            base_price,
            subtotal: self.coefficient * base_price,
            items,
        }
    }

    fn with_templates(&self, templates: &[ItemTemplate]) -> Self {
        if !self.items.is_empty() {
            return self.clone();
        }
        if self.coefficient <= 0.0 && self.subtotal <= 0.0 {
            return self.clone();
        }
        ComponentCost::from_share(self.subtotal, templates)
    }

    /// Bangun kategori komponen dari daftar resource item (dipakai saat load
    /// dari tabel ter-normalisasi `node_resource_items`).
    pub fn from_items(items: Vec<ComponentItem>) -> Self {
        let coefficient: f64 = items.iter().map(|item| item.coefficient).sum();
        let subtotal: f64 = items.iter().map(|item| item.subtotal).sum();
        Self {
            coefficient,
            base_price: if coefficient > 0.0 {
                subtotal / coefficient
            } else {
                0.0
            },
            subtotal,
            items,
        }
    }

    pub fn set_item_price(&mut self, name: &str, unit: &str, base_price: f64) -> bool {
        let mut touched = false;
        for item in self.items.iter_mut() {
            if item.name == name && item.unit == unit {
                item.base_price = base_price;
                item.subtotal = item.coefficient * base_price;
                touched = true;
            }
        }
        if touched {
            self.subtotal = self.items.iter().map(|item| item.subtotal).sum();
            self.coefficient = self.items.iter().map(|item| item.coefficient).sum();
            self.base_price = if self.coefficient > 0.0 {
                self.subtotal / self.coefficient
            } else {
                self.base_price
            };
        }
        touched
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WbsComponents {
    pub bahan: ComponentCost,
    pub tenaga: ComponentCost,
    pub alat: ComponentCost,
}

impl WbsComponents {
    /// Turunkan komponen dari `unit_price` tanpa memaksakan kategori Alat.
    /// Pekerjaan tanpa alat (mis. pengecatan) tidak lagi otomatis dialokasikan
    /// 15% ke "Alat Berat". Kategori Alat dibiarkan kosong sampai pengguna
    /// menambahkannya sendiri.
    pub fn from_unit_price(unit_price: f64) -> Self {
        let price = if unit_price.is_finite() && unit_price > 0.0 {
            unit_price
        } else {
            0.0
        };

        Self {
            bahan: ComponentCost::from_share(price * 0.70, BAHAN_ITEMS),
            tenaga: ComponentCost::from_share(price * 0.30, TENAGA_ITEMS),
            alat: ComponentCost::default(),
        }
    }

    pub fn total(&self) -> f64 {
        self.bahan.subtotal + self.tenaga.subtotal + self.alat.subtotal
    }

    pub fn backfill_items(&mut self) {
        self.bahan = self.bahan.with_templates(BAHAN_ITEMS);
        self.tenaga = self.tenaga.with_templates(TENAGA_ITEMS);
        self.alat = self.alat.with_templates(ALAT_ITEMS);
    }

    pub fn set_item_price(&mut self, name: &str, unit: &str, base_price: f64) -> bool {
        let bahan = self.bahan.set_item_price(name, unit, base_price);
        let tenaga = self.tenaga.set_item_price(name, unit, base_price);
        let alat = self.alat.set_item_price(name, unit, base_price);
        bahan || tenaga || alat
    }

    /// Skalakan seluruh harga dasar resource dengan faktor (dipakai saat
    /// wilayah proyek berubah / multiplier regional diterapkan).
    pub fn scale_prices(&mut self, factor: f64) {
        if !factor.is_finite() || factor <= 0.0 {
            return;
        }
        self.bahan = self.bahan.scaled(factor);
        self.tenaga = self.tenaga.scaled(factor);
        self.alat = self.alat.scaled(factor);
    }

    pub fn rebalanced_to(&self, target: f64) -> Self {
        if !target.is_finite() || target <= 0.0 {
            return Self::from_unit_price(0.0);
        }

        let current = self.total();
        if current <= f64::EPSILON {
            return Self::from_unit_price(target);
        }

        let factor = target / current;
        Self {
            bahan: self.bahan.scaled(factor),
            tenaga: self.tenaga.scaled(factor),
            alat: self.alat.scaled(factor),
        }
    }
}

pub const METHOD_AHSP: &str = "ahsp";
pub const METHOD_LANGSUNG: &str = "langsung";

fn default_method() -> String {
    METHOD_LANGSUNG.to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WbsNode {
    pub id: String,
    pub parent_id: Option<String>,
    pub children_ids: Vec<String>,
    pub code: String,
    pub name: String,
    pub unit: String,
    pub volume: f64,
    pub unit_price: f64,
    pub total_price: f64,
    pub is_expanded: bool,
    pub components: WbsComponents,
    #[serde(default = "default_method")]
    pub method: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeltaPayload {
    pub item_id: String,
    pub field: String,
    pub new_value: f64,
}

/// Rencana kerja (sheet Rencana Kerja) yang dipersistensi per baris pekerjaan.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkPlan {
    pub node_id: String,
    pub num_workers: f64,
    pub duration_days: f64,
}

/// Wilayah proyek aktif + faktor pengali harga regional.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegionInfo {
    pub region_id: String,
    pub region_name: String,
    pub multiplier_factor: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct EngineSnapshot {
    pub nodes: Vec<WbsNode>,
    pub roots: Vec<String>,
    pub total_cost: f64,
    pub overhead_percent: f64,
    pub can_undo: bool,
    pub can_redo: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct AffectedPatch {
    pub nodes: Vec<WbsNode>,
    pub total_cost: f64,
}

/// Metadata header proyek (dipakai pada dokumen RAB/PDF dan dialog Project Info).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProjectInfo {
    pub name: String,
    pub location: String,
    pub owner: String,
    pub contractor: String,
    pub contract_no: String,
    pub start_date: String,
}

/// Ringkasan riwayat undo/redo untuk panel History.
#[derive(Debug, Clone, Serialize)]
pub struct HistoryView {
    pub undo: Vec<String>,
    pub redo: Vec<String>,
    pub can_undo: bool,
    pub can_redo: bool,
}
