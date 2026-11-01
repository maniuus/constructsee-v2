use std::path::{Path, PathBuf};

use rusqlite::{params, Connection};
use serde::Serialize;

const MASTER_JSON: &str = include_str!("../../public/data/ahsp.json");

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS master_divisions (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS master_items (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    level INTEGER NOT NULL,
    parent_code TEXT NOT NULL,
    division_id INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS master_components (
    item_id TEXT NOT NULL REFERENCES master_items(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    ord INTEGER NOT NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    unit TEXT NOT NULL,
    coefficient REAL NOT NULL,
    PRIMARY KEY (item_id, category, ord)
);

CREATE INDEX IF NOT EXISTS idx_master_items_code ON master_items(code);
CREATE INDEX IF NOT EXISTS idx_master_items_parent ON master_items(parent_code);

-- Indeks harga regional (read-only katalog referensi).
CREATE TABLE IF NOT EXISTS regional_indexes (
    id TEXT PRIMARY KEY,
    province TEXT NOT NULL,
    city_regency TEXT NOT NULL,
    multiplier_factor REAL NOT NULL DEFAULT 1.0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
"#;

const REGION_SEED: &[(&str, &str, &str, f64)] = &[
    ("national", "NASIONAL", "NASIONAL", 1.000),
    ("dki-jakarta", "DKI JAKARTA", "JAKARTA PUSAT", 1.052),
    ("jawa-barat", "JAWA BARAT", "KOTA BANDUNG", 1.000),
    ("jawa-timur", "JAWA TIMUR", "KOTA SURABAYA", 1.018),
    ("bali", "BALI", "KOTA DENPASAR", 1.095),
    ("sumatera-utara", "SUMATERA UTARA", "KOTA MEDAN", 1.062),
    ("kalimantan-timur", "KALIMANTAN TIMUR", "KOTA BALIKPAPAN", 1.248),
    ("sulawesi-selatan", "SULAWESI SELATAN", "KOTA MAKASSAR", 1.107),
    ("papua", "PAPUA", "KABUPATEN PUNCAK JAYA", 1.850),
    ("maluku", "MALUKU", "KOTA AMBON", 1.320),
];

#[derive(Debug, Clone, Serialize)]
pub struct Region {
    pub id: String,
    pub province: String,
    pub city_regency: String,
    pub multiplier_factor: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct MasterStats {
    pub divisions: i64,
    pub items: i64,
    pub components: i64,
    pub regions: i64,
}

/// Handle lokasi file master DB (read-only katalog). Command membuka koneksi
/// baru per pemanggilan agar tidak berbagi `Connection` lintas thread.
#[derive(Clone)]
pub struct MasterDb {
    pub path: PathBuf,
}

impl MasterDb {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn open(&self) -> Result<Connection, String> {
        open(&self.path)
    }
}

pub fn open(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let mut conn = Connection::open(path).map_err(|error| error.to_string())?;
    conn.pragma_update(None, "foreign_keys", true)
        .map_err(|error| error.to_string())?;
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|error| error.to_string())?;
    conn.execute_batch(SCHEMA).map_err(|error| error.to_string())?;
    seed_if_empty(&mut conn)?;
    Ok(conn)
}

/// Pastikan master DB sudah terisi. Dipanggil saat startup.
pub fn ensure(path: &Path) -> Result<(), String> {
    let _ = open(path)?;
    Ok(())
}

fn count(conn: &Connection, table: &str) -> i64 {
    conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| row.get(0))
        .unwrap_or(0)
}

fn seed_if_empty(conn: &mut Connection) -> Result<(), String> {
    if count(conn, "regional_indexes") == 0 {
        seed_regions(conn)?;
    }
    if count(conn, "master_items") == 0 {
        seed_catalog(conn)?;
    }
    Ok(())
}

fn seed_regions(conn: &Connection) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(|error| error.to_string())?;
    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO regional_indexes (id, province, city_regency, multiplier_factor)
                 VALUES (?1, ?2, ?3, ?4)",
            )
            .map_err(|error| error.to_string())?;
        for (id, province, city, multiplier) in REGION_SEED {
            stmt.execute(params![id, province, city, multiplier])
                .map_err(|error| error.to_string())?;
        }
    }
    tx.commit().map_err(|error| error.to_string())
}

fn as_id(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::String(text) => text.clone(),
        serde_json::Value::Number(number) => number.to_string(),
        _ => value.to_string(),
    }
}

fn as_str(value: &serde_json::Value) -> String {
    value.as_str().map(str::to_string).unwrap_or_default()
}

fn as_f64(value: &serde_json::Value) -> f64 {
    value.as_f64().unwrap_or(0.0)
}

fn as_i64(value: &serde_json::Value) -> i64 {
    value.as_i64().unwrap_or(0)
}

fn seed_catalog(conn: &mut Connection) -> Result<(), String> {
    let root: serde_json::Value =
        serde_json::from_str(MASTER_JSON).map_err(|error| format!("master JSON invalid: {error}"))?;

    let tx = conn.transaction().map_err(|error| error.to_string())?;

    if let Some(divisions) = root.get("divisi").and_then(|value| value.as_array()) {
        let mut stmt = tx
            .prepare("INSERT OR REPLACE INTO master_divisions (id, code, name) VALUES (?1, ?2, ?3)")
            .map_err(|error| error.to_string())?;
        for row in divisions {
            let Some(cells) = row.as_array() else { continue };
            let id = cells.first().map(as_i64).unwrap_or(0);
            let code = cells.get(1).map(as_str).unwrap_or_default();
            let name = cells.get(2).map(as_str).unwrap_or_default();
            stmt.execute(params![id, code, name])
                .map_err(|error| error.to_string())?;
        }
    }

    if let Some(items) = root.get("items").and_then(|value| value.as_array()) {
        let mut stmt = tx
            .prepare(
                "INSERT OR REPLACE INTO master_items
                    (id, code, name, unit, level, parent_code, division_id)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )
            .map_err(|error| error.to_string())?;
        for row in items {
            let Some(cells) = row.as_array() else { continue };
            let id = cells.first().map(as_id).unwrap_or_default();
            let code = cells.get(1).map(as_str).unwrap_or_default();
            let name = cells.get(2).map(as_str).unwrap_or_default();
            let unit = cells.get(3).map(as_str).unwrap_or_default();
            let level = cells.get(4).map(as_i64).unwrap_or(0);
            let parent_code = cells.get(5).map(as_str).unwrap_or_default();
            let division_id = cells.get(6).map(as_i64).unwrap_or(0);
            stmt.execute(params![id, code, name, unit, level, parent_code, division_id])
                .map_err(|error| error.to_string())?;
        }
    }

    if let Some(komp) = root.get("komp").and_then(|value| value.as_object()) {
        let mut stmt = tx
            .prepare(
                "INSERT OR REPLACE INTO master_components
                    (item_id, category, ord, name, code, unit, coefficient)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )
            .map_err(|error| error.to_string())?;
        for (item_id, rows) in komp {
            let Some(list) = rows.as_array() else { continue };
            for (ord, row) in list.iter().enumerate() {
                let Some(cells) = row.as_array() else { continue };
                let category = cells.first().map(as_str).unwrap_or_default();
                let name = cells.get(1).map(as_str).unwrap_or_default();
                let code = cells.get(2).map(as_str).unwrap_or_default();
                let unit = cells.get(3).map(as_str).unwrap_or_default();
                let coefficient = cells.get(4).map(as_f64).unwrap_or(0.0);
                stmt.execute(params![
                    item_id,
                    category,
                    ord as i64,
                    name,
                    code,
                    unit,
                    coefficient
                ])
                .map_err(|error| error.to_string())?;
            }
        }
    }

    tx.commit().map_err(|error| error.to_string())
}

pub fn regions(conn: &Connection) -> Result<Vec<Region>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, province, city_regency, multiplier_factor
             FROM regional_indexes ORDER BY province, city_regency",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Region {
                id: row.get(0)?,
                province: row.get(1)?,
                city_regency: row.get(2)?,
                multiplier_factor: row.get(3)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())
}

pub fn region(conn: &Connection, id: &str) -> Result<Option<Region>, String> {
    use rusqlite::OptionalExtension;
    conn.query_row(
        "SELECT id, province, city_regency, multiplier_factor
         FROM regional_indexes WHERE id = ?1",
        params![id],
        |row| {
            Ok(Region {
                id: row.get(0)?,
                province: row.get(1)?,
                city_regency: row.get(2)?,
                multiplier_factor: row.get(3)?,
            })
        },
    )
    .optional()
    .map_err(|error| error.to_string())
}

pub fn stats(conn: &Connection) -> Result<MasterStats, String> {
    Ok(MasterStats {
        divisions: count(conn, "master_divisions"),
        items: count(conn, "master_items"),
        components: count(conn, "master_components"),
        regions: count(conn, "regional_indexes"),
    })
}
