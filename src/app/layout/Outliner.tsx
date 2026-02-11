// ============================================================
// Outliner — Scene hierarchy tree view
// Apple HIG: Persistent sidebar, highlight active selection,
//            show node type icons, expand/collapse with chevrons
// ============================================================

import React, { useState } from "react";
import { useEditorStore } from "../../store/editorStore";
import type { SceneNode, NodeId } from "../../core/document/types";
import "./Outliner.css";

const NODE_TYPE_ICONS: Record<string, string> = {
  scene: "🎬",
  group: "📁",
  mesh: "🔷",
  light: "💡",
  camera: "📷",
};

interface TreeNodeProps {
  node: SceneNode;
  depth: number;
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, depth }) => {
  const [expanded, setExpanded] = useState(true);
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const selectNode = useEditorStore((s) => s.selectNode);
  const toggleVisibility = useEditorStore((s) => s.toggleNodeVisibility);
  const document = useEditorStore((s) => s.document);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedNodeId === node.id;

  return (
    <div className="outliner-node-container">
      <div
        className={`outliner-node ${isSelected ? "selected" : ""}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => selectNode(node.id)}
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={hasChildren ? expanded : undefined}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") selectNode(node.id);
        }}
      >
        {/* Expand/Collapse chevron */}
        <button
          className={`outliner-chevron ${hasChildren ? "has-children" : ""} ${expanded ? "expanded" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          tabIndex={-1}
          aria-hidden={!hasChildren}
        >
          {hasChildren ? "▸" : ""}
        </button>

        {/* Node icon */}
        <span className="outliner-icon">
          {NODE_TYPE_ICONS[node.type] ?? "•"}
        </span>

        {/* Node name */}
        <span className="outliner-name">{node.name}</span>

        {/* Visibility toggle */}
        <button
          className={`outliner-visibility ${node.visible ? "" : "hidden-node"}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleVisibility(node.id);
          }}
          title={node.visible ? "Hide" : "Show"}
          tabIndex={-1}
        >
          {node.visible ? "👁" : "👁‍🗨"}
        </button>
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div className="outliner-children" role="group">
          {node.children.map((childId) => {
            const child = document.nodes[childId];
            if (!child) return null;
            return <TreeNode key={childId} node={child} depth={depth + 1} />;
          })}
        </div>
      )}
    </div>
  );
};

export const Outliner: React.FC = () => {
  const document = useEditorStore((s) => s.document);
  const selectNode = useEditorStore((s) => s.selectNode);

  const rootNodes = document.rootIds
    .map((id) => document.nodes[id])
    .filter(Boolean) as SceneNode[];

  return (
    <div className="outliner" role="tree" aria-label="Scene hierarchy">
      <div className="outliner-header">
        <span className="outliner-title">Scene</span>
        <span className="outliner-count">{Object.keys(document.nodes).length}</span>
      </div>

      <div className="outliner-tree">
        {rootNodes.length === 0 ? (
          <div className="outliner-empty">
            <span className="outliner-empty-text">
              No objects in scene.
            </span>
            <span className="outliner-empty-hint">
              Import a model or add a primitive to get started.
            </span>
          </div>
        ) : (
          rootNodes.map((node) => (
            <TreeNode key={node.id} node={node} depth={0} />
          ))
        )}
      </div>
    </div>
  );
};
