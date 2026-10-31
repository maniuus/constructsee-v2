use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};

use super::models::{WbsComponents, WbsNode};

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
"#;

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let conn = Connection::open(path)?;
    let _: String = conn.query_row("PRAGMA journal_mode=WAL", [], |row| row.get(0))?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
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

pub fn load(conn: &Connection) -> rusqlite::Result<(Vec<WbsNode>, Vec<String>)> {
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
        }

        Ok(node)
    })?;

    let nodes = rows.collect::<rusqlite::Result<Vec<_>>>()?;

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
                serde_json::to_string(&node.components).unwrap_or_else(|_| "{}".into()),
                node.method,
            ])?;
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
        let mut stmt = tx.prepare("DELETE FROM wbs_nodes WHERE id = ?1")?;
        for id in ids {
            stmt.execute(params![id])?;
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
                serde_json::to_string(&node.components).unwrap_or_else(|_| "{}".into()),
                node.method,
            ])?;
        }
    }
    tx.commit()
}
