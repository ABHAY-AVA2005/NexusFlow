/**
 * Visual Rule Graph Mongoose Model
 *
 * Defines schema and persistence rules for NexusFlow visual rule graphs.
 * Supports full graph persistence, topological and cycle validation,
 * device/environmental scoping, and active/inactive state lifecycle.
 *
 * @module models/rule.model
 */

const mongoose = require('mongoose');
const { validateGraph, topologicalSort } = require('../compiler/graphCompiler');

const ALLOWED_NODE_TYPES = ['source', 'math', 'filter', 'action'];

/**
 * Subdocument schema for individual visual rule nodes.
 */
const ruleNodeSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: [true, 'Node id is required'],
      trim: true
    },
    type: {
      type: String,
      required: [true, 'Node type is required'],
      enum: {
        values: ALLOWED_NODE_TYPES,
        message: 'Node type "{VALUE}" is not supported. Allowed types: source, math, filter, action'
      }
    },
    config: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({})
    }
  },
  {
    _id: false,
    minimize: false
  }
);

/**
 * Subdocument schema for graph edges connecting rule nodes.
 */
const ruleEdgeSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      trim: true
    },
    source: {
      type: String,
      required: [true, 'Edge source is required'],
      trim: true
    },
    target: {
      type: String,
      required: [true, 'Edge target is required'],
      trim: true
    }
  },
  {
    _id: false,
    minimize: false
  }
);

/**
 * Subdocument schema for device and environmental scoping.
 */
const ruleScopeSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      default: 'all',
      trim: true
    },
    deviceType: {
      type: String,
      default: 'all',
      trim: true
    },
    location: {
      type: String,
      default: 'all',
      trim: true
    }
  },
  {
    _id: false,
    minimize: false
  }
);

/**
 * Main Visual Rule Schema
 */
const ruleSchema = new mongoose.Schema(
  {
    graphId: {
      type: String,
      required: [true, 'graphId is required and must be a unique string'],
      unique: true,
      trim: true
    },
    name: {
      type: String,
      required: [true, 'Rule name is required'],
      trim: true
    },
    description: {
      type: String,
      default: '',
      trim: true
    },
    scope: {
      type: ruleScopeSchema,
      default: () => ({
        deviceId: 'all',
        deviceType: 'all',
        location: 'all'
      })
    },
    nodes: {
      type: [ruleNodeSchema],
      required: [true, 'Rule nodes are required'],
      validate: {
        validator: function (nodes) {
          return Array.isArray(nodes) && nodes.length > 0;
        },
        message: 'Rule must contain at least one node.'
      }
    },
    edges: {
      type: [ruleEdgeSchema],
      default: () => []
    },
    active: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    collection: 'rules',
    timestamps: true,
    versionKey: false,
    minimize: false
  }
);

/**
 * Pre-validation hook:
 * Enforces graph structural integrity and cycle detection using the
 * shared compiler validation suite before saving to MongoDB.
 */
ruleSchema.pre('validate', function () {
  if (Array.isArray(this.nodes) && this.nodes.length > 0) {
    const plainNodes = this.nodes.map((node) => {
      if (node && typeof node.toObject === 'function') {
        const obj = node.toObject();
        // Ensure config remains an object even if empty
        if (!obj.config || typeof obj.config !== 'object' || Array.isArray(obj.config)) {
          obj.config = {};
        }
        return obj;
      }
      return node;
    });

    const plainEdges = Array.isArray(this.edges)
      ? this.edges.map((edge) => (edge && typeof edge.toObject === 'function' ? edge.toObject() : edge))
      : [];

    try {
      const graphPayload = {
        id: this.graphId,
        nodes: plainNodes,
        edges: plainEdges
      };

      // 1. Structural graph validation (node types, unique IDs, edge endpoint integrity)
      validateGraph(graphPayload);

      // 2. Topological sort & cycle detection (Kahn's algorithm)
      topologicalSort(graphPayload);
    } catch (validationError) {
      const errorMessage = validationError.message;
      const targetPath = errorMessage.toLowerCase().includes('edge') ? 'edges' : 'nodes';
      this.invalidate(targetPath, errorMessage);
    }
  }
});

const Rule = mongoose.models.Rule || mongoose.model('Rule', ruleSchema);

module.exports = Rule;
