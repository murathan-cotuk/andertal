/**
 * Landing container tree helpers (nested children[]).
 * Depth: root = 1; max = MAX_LANDING_CONTAINER_DEPTH.
 */

export const MAX_LANDING_CONTAINER_DEPTH = 3;

export function newLandingContainerId() {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Deep-clone a container subtree with fresh ids. */
export function cloneContainerTree(node) {
  if (!node || typeof node !== "object") return node;
  const copy = {
    ...node,
    id: newLandingContainerId(),
  };
  if (Array.isArray(node.children)) {
    copy.children = node.children.map((ch) => cloneContainerTree(ch));
  }
  return copy;
}

/** Depth of id in forest (1 = root). Returns 0 if not found. */
export function getContainerDepth(list, id, depth = 1) {
  if (!Array.isArray(list)) return 0;
  for (const node of list) {
    if (node?.id === id) return depth;
    const nested = getContainerDepth(node?.children, id, depth + 1);
    if (nested) return nested;
  }
  return 0;
}

export function findContainerById(list, id) {
  if (!Array.isArray(list)) return null;
  for (const node of list) {
    if (node?.id === id) return node;
    const nested = findContainerById(node?.children, id);
    if (nested) return nested;
  }
  return null;
}

/** Immutable map: replace node with id via updater(node) => nextNode */
export function mapContainerById(list, id, updater) {
  if (!Array.isArray(list)) return list;
  return list.map((node) => {
    if (node?.id === id) return updater(node);
    if (Array.isArray(node?.children)) {
      const children = mapContainerById(node.children, id, updater);
      if (children !== node.children) return { ...node, children };
    }
    return node;
  });
}

export function removeContainerById(list, id) {
  if (!Array.isArray(list)) return list;
  const next = [];
  for (const node of list) {
    if (node?.id === id) continue;
    if (Array.isArray(node?.children)) {
      next.push({ ...node, children: removeContainerById(node.children, id) });
    } else {
      next.push(node);
    }
  }
  return next;
}

/** Reorder siblings that match `inGroup` predicate; only swaps within that sibling list. */
export function moveSiblingInGroup(list, id, dir, inGroup) {
  if (!Array.isArray(list)) return list;
  const group = list.filter((c) => inGroup(c));
  const pos = group.findIndex((c) => c.id === id);
  if (pos >= 0) {
    const newPos = pos + dir;
    if (newPos < 0 || newPos >= group.length) return list;
    const idA = id;
    const idB = group[newPos].id;
    const iA = list.findIndex((c) => c.id === idA);
    const iB = list.findIndex((c) => c.id === idB);
    if (iA < 0 || iB < 0) return list;
    const n = [...list];
    [n[iA], n[iB]] = [n[iB], n[iA]];
    return n;
  }
  return list.map((node) => {
    if (!Array.isArray(node?.children)) return node;
    const children = moveSiblingInGroup(node.children, id, dir, () => true);
    if (children === node.children) return node;
    return { ...node, children };
  });
}

export function appendChildContainer(list, parentId, child) {
  return mapContainerById(list, parentId, (parent) => ({
    ...parent,
    children: [...(Array.isArray(parent.children) ? parent.children : []), child],
  }));
}

export function canAddChild(list, parentId) {
  const depth = getContainerDepth(list, parentId);
  return depth > 0 && depth < MAX_LANDING_CONTAINER_DEPTH;
}
