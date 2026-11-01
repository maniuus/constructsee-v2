//! Analitik proyek Fase 3: Kurva S (time-cost) & Pareto 80/20.
//!
//! Time basis: tanggal mulai proyek + penjadwalan sekuensial berdasarkan
//! `duration_days` dari sheet Rencana Kerja. Pekerjaan tanpa durasi memakai
//! default 1 hari dan dilaporkan lewat `warnings`.

use std::cmp::Ordering;
use std::collections::HashMap;

use chrono::NaiveDate;
use serde::Serialize;

use super::calc;
use super::models::{WbsNode, WorkPlan};

#[derive(Debug, Clone, Serialize)]
pub struct SCurvePoint {
    /// Minggu ke- (1-based).
    pub week: u32,
    /// Tanggal awal minggu (YYYY-MM-DD).
    pub date: String,
    /// Bobot pekerjaan yang diselesaikan pada minggu ini (%).
    pub weekly: f64,
    /// Bobot kumulatif sampai akhir minggu ini (%).
    pub cumulative: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScheduleItem {
    pub node_id: String,
    pub code: String,
    pub name: String,
    pub start_day: f64,
    pub end_day: f64,
    pub duration_days: f64,
    /// Bobot pekerjaan terhadap total nilai pekerjaan terjadwal (%).
    pub weight: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ParetoItem {
    pub name: String,
    pub unit: String,
    pub category: String,
    pub total_cost: f64,
    pub cost_percentage: f64,
    pub cumulative_percentage: f64,
    /// True selama resource termasuk kelompok kritis yang menyerap 80% biaya.
    pub critical: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct Analytics {
    pub project_start: String,
    /// Total nilai pekerjaan terjadwal (subtotal leaf, sebelum overhead).
    pub total_cost: f64,
    pub total_days: f64,
    pub s_curve: Vec<SCurvePoint>,
    pub schedule: Vec<ScheduleItem>,
    pub pareto: Vec<ParetoItem>,
    pub warnings: Vec<String>,
}

fn is_billable(node: &WbsNode) -> bool {
    node.children_ids.is_empty() && node.total_price > 0.0
}

fn week_date(start: &str, week_index: usize) -> String {
    NaiveDate::parse_from_str(start, "%Y-%m-%d")
        .map(|date| {
            let shifted = date + chrono::Duration::days((week_index * 7) as i64);
            shifted.format("%Y-%m-%d").to_string()
        })
        .unwrap_or_default()
}

pub fn compute(
    nodes: &HashMap<String, WbsNode>,
    roots: &[String],
    plans: &HashMap<String, WorkPlan>,
    project_start: &str,
) -> Analytics {
    let ordered = calc::ordered_nodes(nodes, roots);
    let subtotal: f64 = ordered
        .iter()
        .filter(|(node, _)| is_billable(node))
        .map(|(node, _)| node.total_price)
        .sum();

    let mut warnings: Vec<String> = Vec::new();
    if subtotal <= 0.0 {
        warnings.push("Belum ada pekerjaan bernilai biaya untuk dijadwalkan.".to_string());
    }

    let mut schedule: Vec<ScheduleItem> = Vec::new();
    let mut cursor = 0.0_f64;
    let mut missing_duration = 0usize;

    for (node, _) in &ordered {
        if !is_billable(node) {
            continue;
        }

        let planned = plans
            .get(&node.id)
            .map(|plan| plan.duration_days)
            .filter(|duration| duration.is_finite() && *duration > 0.0);
        let duration = match planned {
            Some(value) => value,
            None => {
                missing_duration += 1;
                1.0
            }
        };

        let weight = if subtotal > 0.0 {
            node.total_price / subtotal * 100.0
        } else {
            0.0
        };

        schedule.push(ScheduleItem {
            node_id: node.id.clone(),
            code: node.code.clone(),
            name: node.name.clone(),
            start_day: cursor,
            end_day: cursor + duration,
            duration_days: duration,
            weight,
        });
        cursor += duration;
    }

    if missing_duration > 0 {
        warnings.push(format!(
            "{missing_duration} pekerjaan belum punya durasi; memakai default 1 hari."
        ));
    }

    let total_days = cursor;
    let day_count = total_days.ceil().max(1.0) as usize;

    // Distribusi bobot harian (spread uniform sepanjang durasi, dengan
    // proporsi overlap untuk durasi pecahan).
    let mut daily = vec![0.0_f64; day_count];
    for item in &schedule {
        if item.duration_days <= 0.0 || item.weight <= 0.0 {
            continue;
        }
        let first = item.start_day.floor() as usize;
        let last = item.end_day.ceil() as usize;
        for (day, slot) in daily.iter_mut().enumerate().take(last).skip(first) {
            let day_start = day as f64;
            let day_end = day_start + 1.0;
            let overlap = item.end_day.min(day_end) - item.start_day.max(day_start);
            if overlap > 0.0 {
                *slot += item.weight * overlap / item.duration_days;
            }
        }
    }

    let week_count = (day_count as f64 / 7.0).ceil() as usize;
    let mut s_curve: Vec<SCurvePoint> = Vec::with_capacity(week_count);
    let mut cumulative = 0.0_f64;
    for week in 0..week_count {
        let start = week * 7;
        let end = (start + 7).min(day_count);
        let weekly: f64 = daily[start..end].iter().sum();
        cumulative += weekly;
        s_curve.push(SCurvePoint {
            week: (week + 1) as u32,
            date: week_date(project_start, week),
            weekly,
            cumulative,
        });
    }

    let pareto = build_pareto(&ordered);
    if pareto.is_empty() && subtotal > 0.0 {
        warnings.push(
            "Rincian resource (AHSP) belum tersedia untuk analisa Pareto.".to_string(),
        );
    }

    Analytics {
        project_start: project_start.to_string(),
        total_cost: subtotal,
        total_days,
        s_curve,
        schedule,
        pareto,
        warnings,
    }
}

fn build_pareto(ordered: &[(WbsNode, usize)]) -> Vec<ParetoItem> {
    let mut agg: HashMap<(String, String, String), f64> = HashMap::new();

    for (node, _) in ordered {
        if !is_billable(node) {
            continue;
        }
        let categories = [
            ("tenaga", &node.components.tenaga),
            ("bahan", &node.components.bahan),
            ("alat", &node.components.alat),
        ];
        for (category, cost) in categories {
            for item in &cost.items {
                let total = item.coefficient * item.base_price * node.volume;
                if total <= 0.0 {
                    continue;
                }
                let key = (item.name.clone(), item.unit.clone(), category.to_string());
                *agg.entry(key).or_insert(0.0) += total;
            }
        }
    }

    let mut rows: Vec<(String, String, String, f64)> = agg
        .into_iter()
        .map(|((name, unit, category), total_cost)| (name, unit, category, total_cost))
        .collect();
    rows.sort_by(|a, b| b.3.partial_cmp(&a.3).unwrap_or(Ordering::Equal));

    let grand: f64 = rows.iter().map(|row| row.3).sum();
    if grand <= 0.0 {
        return Vec::new();
    }

    let mut cumulative = 0.0_f64;
    let mut pareto = Vec::with_capacity(rows.len());
    for (name, unit, category, total_cost) in rows {
        let before = cumulative;
        cumulative += total_cost;
        pareto.push(ParetoItem {
            name,
            unit,
            category,
            total_cost,
            cost_percentage: total_cost / grand * 100.0,
            cumulative_percentage: cumulative / grand * 100.0,
            critical: before < 80.0,
        });
    }
    pareto
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::models::{ComponentCost, ComponentItem, WbsComponents};

    fn leaf(id: &str, parent: Option<&str>, code: &str, total: f64, volume: f64) -> WbsNode {
        WbsNode {
            id: id.to_string(),
            parent_id: parent.map(|value| value.to_string()),
            children_ids: Vec::new(),
            code: code.to_string(),
            name: format!("Item {id}"),
            unit: "m3".to_string(),
            volume,
            unit_price: if volume > 0.0 { total / volume } else { total },
            total_price: total,
            is_expanded: true,
            components: WbsComponents::default(),
            method: "langsung".to_string(),
        }
    }

    fn parent(id: &str, children: &[&str]) -> WbsNode {
        WbsNode {
            id: id.to_string(),
            parent_id: None,
            children_ids: children.iter().map(|value| value.to_string()).collect(),
            code: "I".to_string(),
            name: format!("Divisi {id}"),
            unit: String::new(),
            volume: 0.0,
            unit_price: 0.0,
            total_price: 0.0,
            is_expanded: true,
            components: WbsComponents::default(),
            method: "langsung".to_string(),
        }
    }

    fn map_of(nodes: Vec<WbsNode>) -> HashMap<String, WbsNode> {
        nodes
            .into_iter()
            .map(|node| (node.id.clone(), node))
            .collect()
    }

    #[test]
    fn sequential_schedule_and_weights() {
        let nodes = map_of(vec![
            parent("div", &["a", "b"]),
            leaf("a", Some("div"), "1.1", 40.0, 1.0),
            leaf("b", Some("div"), "1.2", 60.0, 1.0),
        ]);
        let plans = HashMap::from([
            (
                "a".to_string(),
                WorkPlan { node_id: "a".into(), num_workers: 2.0, duration_days: 2.0 },
            ),
            (
                "b".to_string(),
                WorkPlan { node_id: "b".into(), num_workers: 3.0, duration_days: 3.0 },
            ),
        ]);

        let result = compute(&nodes, &["div".to_string()], &plans, "2026-01-01");

        assert_eq!(result.schedule.len(), 2);
        assert_eq!(result.schedule[0].start_day, 0.0);
        assert_eq!(result.schedule[0].end_day, 2.0);
        assert_eq!(result.schedule[1].start_day, 2.0);
        assert_eq!(result.schedule[1].end_day, 5.0);
        assert!(approx(result.schedule[0].weight, 40.0));
        assert!(approx(result.schedule[1].weight, 60.0));
        assert!(approx(result.total_days, 5.0));
        assert!(approx(result.total_cost, 100.0));

        let last = result.s_curve.last().expect("s_curve tidak kosong");
        assert!(approx(last.cumulative, 100.0));
        assert!(!result
            .warnings
            .iter()
            .any(|warning| warning.contains("default 1 hari")));
    }

    #[test]
    fn pareto_marks_critical_group() {
        let mut node = leaf("x", None, "1.1", 100.0, 1.0);
        let item = |name: &str, coefficient: f64, base: f64| ComponentItem {
            name: name.to_string(),
            unit: "ls".to_string(),
            coefficient,
            base_price: base,
            subtotal: coefficient * base,
        };
        node.components = WbsComponents {
            tenaga: ComponentCost {
                coefficient: 1.0,
                base_price: 50.0,
                subtotal: 50.0,
                items: vec![item("Pekerja", 1.0, 50.0)],
            },
            bahan: ComponentCost {
                coefficient: 1.0,
                base_price: 30.0,
                subtotal: 30.0,
                items: vec![item("Semen", 1.0, 30.0)],
            },
            alat: ComponentCost {
                coefficient: 1.0,
                base_price: 30.0,
                subtotal: 30.0,
                items: vec![item("Alat", 1.0, 30.0)],
            },
        };

        let nodes = map_of(vec![node]);
        let result = compute(&nodes, &["x".to_string()], &HashMap::new(), "2026-01-01");

        assert_eq!(result.pareto.len(), 3);
        assert!(result.pareto[0].critical);
        assert!(result.pareto[1].critical);
        assert!(!result.pareto[2].critical);
        let last = result.pareto.last().expect("pareto tidak kosong");
        assert!(approx(last.cumulative_percentage, 100.0));
    }

    #[test]
    fn missing_duration_defaults_to_one_day() {
        let nodes = map_of(vec![leaf("a", None, "1.1", 10.0, 1.0)]);
        let result = compute(&nodes, &["a".to_string()], &HashMap::new(), "2026-02-01");

        assert!(approx(result.schedule[0].duration_days, 1.0));
        assert!(approx(result.total_days, 1.0));
        assert!(result
            .warnings
            .iter()
            .any(|warning| warning.contains("default 1 hari")));
    }

    fn approx(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-6
    }
}
