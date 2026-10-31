use std::collections::HashMap;

use super::models::{WbsComponents, WbsNode};

fn sync_leaf(node: &mut WbsNode) {
    if !node.children_ids.is_empty() {
        return;
    }
    if node.components.total() <= f64::EPSILON && node.unit_price > 0.0 {
        node.components = WbsComponents::from_unit_price(node.unit_price);
    }
    node.unit_price = node.components.total();
    node.total_price = node.volume * node.unit_price;
}

pub fn apply_leaf_change(
    nodes: &mut HashMap<String, WbsNode>,
    item_id: &str,
) -> Vec<WbsNode> {
    let mut affected = Vec::new();

    let Some(node) = nodes.get_mut(item_id) else {
        return affected;
    };

    sync_leaf(node);

    affected.push(node.clone());
    let mut cursor = node.parent_id.clone();

    while let Some(parent_id) = cursor {
        let Some(parent) = nodes.get(&parent_id) else {
            break;
        };
        let child_ids = parent.children_ids.clone();
        let total: f64 = child_ids
            .iter()
            .filter_map(|child_id| nodes.get(child_id))
            .map(|child| child.total_price)
            .sum();

        let Some(parent) = nodes.get_mut(&parent_id) else {
            break;
        };
        parent.total_price = total;
        affected.push(parent.clone());
        cursor = parent.parent_id.clone();
    }

    affected
}

pub fn rollup_all(nodes: &mut HashMap<String, WbsNode>) {
    fn visit(nodes: &mut HashMap<String, WbsNode>, id: &str) -> f64 {
        let Some(node) = nodes.get(id) else {
            return 0.0;
        };
        let children = node.children_ids.clone();

        if children.is_empty() {
            let Some(leaf) = nodes.get_mut(id) else {
                return 0.0;
            };
            sync_leaf(leaf);
            return leaf.total_price;
        }

        let mut total = 0.0;
        for child_id in children {
            total += visit(nodes, &child_id);
        }

        if let Some(parent) = nodes.get_mut(id) {
            parent.total_price = total;
        }
        total
    }

    let root_ids: Vec<String> = nodes
        .values()
        .filter(|node| node.parent_id.is_none())
        .map(|node| node.id.clone())
        .collect();

    for root_id in root_ids {
        visit(nodes, &root_id);
    }
}

pub fn total_cost(nodes: &HashMap<String, WbsNode>, roots: &[String]) -> f64 {
    roots
        .iter()
        .filter_map(|root_id| nodes.get(root_id))
        .map(|node| node.total_price)
        .sum()
}

pub fn ordered_nodes(
    nodes: &HashMap<String, WbsNode>,
    roots: &[String],
) -> Vec<(WbsNode, usize)> {
    fn walk(
        nodes: &HashMap<String, WbsNode>,
        id: &str,
        depth: usize,
        ordered: &mut Vec<(WbsNode, usize)>,
    ) {
        let Some(node) = nodes.get(id) else {
            return;
        };
        ordered.push((node.clone(), depth));
        for child_id in &node.children_ids {
            walk(nodes, child_id, depth + 1, ordered);
        }
    }

    let mut collected = Vec::new();
    for root_id in roots {
        walk(nodes, root_id, 0, &mut collected);
    }
    collected
}
