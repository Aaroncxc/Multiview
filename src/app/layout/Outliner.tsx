// ============================================================
// Outliner - Scene hierarchy tree view
// ============================================================

import React, { useMemo, useState } from "react";
import { useEditorStore } from "../../store/editorStore";
import type { NodeId, SceneNode } from "../../core/document/types";
import { isDescendantOf } from "../../core/document/sceneDocument";
import "./Outliner.css";

const NODE_TYPE_ICONS: Record<string, string> = {
  scene: "S",
  group: "G",
  mesh: "M",
  light: "L",
  camera: "C",
  particleEmitter: "P",
};

const ROOT_DROP_TARGET = "__root__";

interface TreeNodeProps {
  node: SceneNode;
  depth: number;
  draggedNodeId: NodeId | null;
  dropTargetId: string | null;
  setDraggedNodeId: React.Dispatch<React.SetStateAction<NodeId | null>>;
  setDropTargetId: React.Dispatch<React.SetStateAction<string | null>>;
  canDropToGroup: (targetId: NodeId) => boolean;
  dropToGroup: (targetId: NodeId) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  depth,
  draggedNodeId,
  dropTargetId,
  setDraggedNodeId,
  setDropTargetId,
  canDropToGroup,
  dropToGroup,
}) => {
  const [expanded, setExpanded] = useState(true);
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const selectNode = useEditorStore((s) => s.selectNode);
  const toggleVisibility = useEditorStore((s) => s.toggleNodeVisibility);
  const document = useEditorStore((s) => s.document);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedNodeId === node.id;
  const isDragging = draggedNodeId === node.id;
  const isDropTarget = dropTargetId === node.id;
  const isDropEnabled = canDropToGroup(node.id);

  return (
    <div className="outliner-node-container">
      <div
        className={`outliner-node ${isSelected ? "selected" : ""} ${
          isDragging ? "is-dragging" : ""
        } ${isDropTarget ? "is-drop-target" : ""}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => selectNode(node.id)}
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={hasChildren ? expanded : undefined}
        aria-grabbed={isDragging}
        aria-dropeffect={isDropEnabled ? "move" : undefined}
        tabIndex={0}
        draggable={node.type !== "scene"}
        onDragStart={(e) => {
          if (node.type === "scene") return;
          setDraggedNodeId(node.id);
          setDropTargetId(null);
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", node.id);
        }}
        onDragOver={(e) => {
          if (!canDropToGroup(node.id)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (dropTargetId !== node.id) {
            setDropTargetId(node.id);
          }
        }}
        onDrop={(e) => {
          if (!canDropToGroup(node.id)) return;
          e.preventDefault();
          dropToGroup(node.id);
        }}
        onDragEnd={() => {
          setDraggedNodeId(null);
          setDropTargetId(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") selectNode(node.id);
        }}
      >
        <button
          className={`outliner-chevron ${hasChildren ? "has-children" : ""} ${
            expanded ? "expanded" : ""
          }`}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          tabIndex={-1}
          aria-hidden={!hasChildren}
        >
          {hasChildren ? ">" : ""}
        </button>

        <span className="outliner-icon">{NODE_TYPE_ICONS[node.type] ?? "."}</span>

        <span className="outliner-name">{node.name}</span>

        <button
          className={`outliner-visibility ${node.visible ? "" : "hidden-node"}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleVisibility(node.id);
          }}
          title={node.visible ? "Hide" : "Show"}
          aria-label={node.visible ? "Hide node" : "Show node"}
          tabIndex={-1}
        >
          {node.visible ? "O" : "-"}
        </button>
      </div>

      {hasChildren && expanded && (
        <div className="outliner-children" role="group">
          {node.children.map((childId) => {
            const child = document.nodes[childId];
            if (!child) return null;
            return (
              <TreeNode
                key={childId}
                node={child}
                depth={depth + 1}
                draggedNodeId={draggedNodeId}
                dropTargetId={dropTargetId}
                setDraggedNodeId={setDraggedNodeId}
                setDropTargetId={setDropTargetId}
                canDropToGroup={canDropToGroup}
                dropToGroup={dropToGroup}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export const Outliner: React.FC = () => {
  const document = useEditorStore((s) => s.document);
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const reparentSceneNode = useEditorStore((s) => s.reparentSceneNode);
  const groupSelectedNode = useEditorStore((s) => s.groupSelectedNode);
  const ungroupNode = useEditorStore((s) => s.ungroupNode);

  const [draggedNodeId, setDraggedNodeId] = useState<NodeId | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const rootNodes = useMemo(
    () =>
      document.rootIds
        .map((id) => document.nodes[id])
        .filter(Boolean) as SceneNode[],
    [document.nodes, document.rootIds]
  );

  const selectedNode = selectedNodeId ? document.nodes[selectedNodeId] : null;
  const canGroup = Boolean(selectedNode && selectedNode.type !== "scene");
  const canUngroup = Boolean(selectedNode && selectedNode.type === "group");

  const canDropToGroup = (targetId: NodeId): boolean => {
    if (!draggedNodeId || draggedNodeId === targetId) return false;
    const draggedNode = document.nodes[draggedNodeId];
    const targetNode = document.nodes[targetId];
    if (!draggedNode || !targetNode) return false;
    if (draggedNode.type === "scene") return false;
    if (targetNode.type !== "group") return false;
    if (draggedNode.parentId === targetId) return false;
    if (isDescendantOf(document, targetId, draggedNodeId)) return false;
    return true;
  };

  const canDropToRoot = (): boolean => {
    if (!draggedNodeId) return false;
    const draggedNode = document.nodes[draggedNodeId];
    if (!draggedNode) return false;
    if (draggedNode.type === "scene") return false;
    return draggedNode.parentId !== null;
  };

  const dropToGroup = (targetId: NodeId) => {
    if (!draggedNodeId || !canDropToGroup(targetId)) return;
    reparentSceneNode(draggedNodeId, targetId);
    setDraggedNodeId(null);
    setDropTargetId(null);
  };

  const dropToRoot = () => {
    if (!draggedNodeId || !canDropToRoot()) return;
    reparentSceneNode(draggedNodeId, null);
    setDraggedNodeId(null);
    setDropTargetId(null);
  };

  return (
    <div className="outliner" role="tree" aria-label="Scene hierarchy">
      <div className="outliner-header">
        <span className="outliner-title">Scene</span>
        <div className="outliner-header-actions">
          <button
            className="outliner-header-btn"
            onClick={() => groupSelectedNode()}
            disabled={!canGroup}
            title="Group selected node (Ctrl+G)"
            aria-label="Group selected node"
          >
            Group
          </button>
          <button
            className="outliner-header-btn"
            onClick={() => {
              if (selectedNodeId) {
                ungroupNode(selectedNodeId);
              }
            }}
            disabled={!canUngroup}
            title="Ungroup selected group (Ctrl+Shift+G)"
            aria-label="Ungroup selected group"
          >
            Ungroup
          </button>
          <span className="outliner-count">{Object.keys(document.nodes).length}</span>
        </div>
      </div>

      <div
        className={`outliner-root-drop ${dropTargetId === ROOT_DROP_TARGET ? "active" : ""}`}
        aria-dropeffect={canDropToRoot() ? "move" : undefined}
        onDragOver={(e) => {
          if (!canDropToRoot()) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (dropTargetId !== ROOT_DROP_TARGET) {
            setDropTargetId(ROOT_DROP_TARGET);
          }
        }}
        onDrop={(e) => {
          if (!canDropToRoot()) return;
          e.preventDefault();
          dropToRoot();
        }}
      >
        Drop here to move node to root
      </div>

      <div className="outliner-tree">
        {rootNodes.length === 0 ? (
          <div className="outliner-empty">
            <span className="outliner-empty-text">No objects in scene.</span>
            <span className="outliner-empty-hint">
              Import a model or add a primitive to get started.
            </span>
          </div>
        ) : (
          rootNodes.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              draggedNodeId={draggedNodeId}
              dropTargetId={dropTargetId}
              setDraggedNodeId={setDraggedNodeId}
              setDropTargetId={setDropTargetId}
              canDropToGroup={canDropToGroup}
              dropToGroup={dropToGroup}
            />
          ))
        )}
      </div>
    </div>
  );
};
