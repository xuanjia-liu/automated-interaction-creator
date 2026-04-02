// Automated Interaction Creator - Figma Plugin
// This plugin manages interactions between selected nodes with two modes:
// 1. Update mode: Update existing interactions on selected layers
// 2. Add mode: Add interactions to selected layers by selection order

interface InteractionSettings {
  trigger: string;
  delay: number;
  animation: string;
  curve: string;
  stiffness: number;
  damping: number;
  mass: number;
  duration: number;
  bezierX1?: number;
  bezierY1?: number;
  bezierX2?: number;
  bezierY2?: number;
}

type SpringPresetName = 'GENTLE' | 'QUICK' | 'BOUNCY' | 'SLOW';

const FIGMA_SPRING_PRESETS: Record<SpringPresetName, { stiffness: number; damping: number; mass: number; duration: number }> = {
  GENTLE: { stiffness: 100, damping: 15, mass: 1, duration: 0.8 },
  QUICK: { stiffness: 300, damping: 20, mass: 1, duration: 0.6 },
  BOUNCY: { stiffness: 600, damping: 15, mass: 1, duration: 0.8 },
  SLOW: { stiffness: 80, damping: 20, mass: 1, duration: 0.6 }
};

function isSpringPresetName(value: string): value is SpringPresetName {
  return value === 'GENTLE' || value === 'QUICK' || value === 'BOUNCY' || value === 'SLOW';
}

// Type Guards and Helpers
function hasChildren(node: BaseNode): node is SceneNode & ChildrenMixin {
  return 'children' in node;
}

function hasLayout(node: BaseNode): node is SceneNode & LayoutMixin {
  return 'absoluteTransform' in node;
}

function hasReactions(node: BaseNode): node is SceneNode & ReactionMixin {
  return 'reactions' in node;
}

function getReactionAction(reaction: Reaction): Action | null {
  // Check for 'actions' (newer API)
  if ('actions' in reaction && Array.isArray((reaction as any).actions) && (reaction as any).actions.length > 0) {
    return (reaction as any).actions[0];
  }
  // Check for 'action' (older API)
  if ('action' in reaction && (reaction as any).action) {
    return (reaction as any).action;
  }
  return null;
}

function getTriggerDelay(trigger: Trigger | null | undefined): number {
  if (!trigger) return 0;
  // Check for timeout (standard) or delay (custom/legacy)
  return (trigger as any)?.timeout || (trigger as any)?.delay || 0;
}

function isNodeAction(action: Action): action is Action & { destinationId: string | null; transition: Transition | null; navigation: Navigation; preserveScrollPosition: boolean } {
  return action.type === 'NODE';
}

interface VariantProperties {
  [property: string]: string;
}

interface ComponentPropertyDefinition {
  type: string;
  variantOptions?: string[];
  defaultValue?: string;
}

// Using Figma's built-in ComponentPropertyDefinitions type

interface LayerInfo {
  id: string;
  name: string;
  type: string;
  interactions: Array<{
    trigger: string;
    delay: number;
    animation: string;
    curve: string;
    duration: number;
    targetId: string | null;
    targetName: string | null;
    direction: string | null;
    actionType: string | null;
    source?: 'component' | 'instance' | 'none';
    stiffness?: number;
    damping?: number;
    mass?: number;
    bezierX1?: number;
    bezierY1?: number;
    bezierX2?: number;
    bezierY2?: number;
  }>;
  variantProperties?: VariantProperties | null;
  componentPropertyDefinitions?: ComponentPropertyDefinitions | null;
}

interface PropertyMappingConfig {
  pairingProperties: string[];
  substitutionProperties: { [property: string]: { from: string; to: string } };
}

interface PositionConfig {
  direction: 'top-to-bottom' | 'bottom-to-top' | 'left-to-right' | 'right-to-left';
  everyN: number;
  skip?: number;
}

interface StepIncrementalConfig {
  delay?: {
    values: number[];
    settings: {
      mode: 'layer-order' | 'position';
      layerOrderDirection: 'ascending' | 'descending';
      positionLayout: 'row' | 'column';
      positionHorizontal: 'left-to-right' | 'right-to-left';
      positionVertical: 'top-to-bottom' | 'bottom-to-top';
      startValue: number;
      stepValue: number;
    };
  } | null;
  duration?: {
    values: number[];
    settings: {
      mode: 'layer-order' | 'position';
      layerOrderDirection: 'ascending' | 'descending';
      positionLayout: 'row' | 'column';
      positionHorizontal: 'left-to-right' | 'right-to-left';
      positionVertical: 'top-to-bottom' | 'bottom-to-top';
      startValue: number;
      stepValue: number;
    };
  } | null;
}

interface PluginMessage {
  type: string;
  mode?: string;
  settings?: InteractionSettings;
  triggerType?: string;
  nodeFilter?: string[];
  variantFilter?: string[];
  fromList?: string[];
  toList?: string[];
  fromVariantFilter?: string[];
  toVariantFilter?: string[];
  propertyMappingConfig?: PropertyMappingConfig;
  positionConfig?: PositionConfig;
  stepIncremental?: StepIncrementalConfig;
  // New ordering options for add mode (By Order)
  orderMode?: 'selection' | 'layer';
  orderReverse?: boolean;
  updateSource?: 'component' | 'instance' | 'instance-remove-variant';
  width?: number;
  height?: number;
  // Saved interaction properties
  savedInteractionId?: string;
  applicationMode?: 'by-order' | 'same-target';
  targetLayerIds?: string[];
  savedInteractionData?: any; // Full saved interaction object
  // Save interaction properties
  layerId?: string;
  savedId?: string;
  interaction?: {
    trigger: string;
    delay: number;
    animation: string;
    curve: string;
    duration: number;
  };
  layerName?: string;
  // Focus node properties
  nodeId?: string;
  // Highlight trigger nodes properties
  nodeIds?: string[];
  data?: any;
}

// Show the HTML UI (enable themeColors to inject Figma CSS variables)
figma.showUI(__html__, { width: 640, height: 600, themeColors: true });

// Load saved interactions from client storage
async function loadSavedInteractions() {
  try {
    const savedData = await figma.clientStorage.getAsync('savedInteractions');
    if (savedData && Array.isArray(savedData)) {
      // Convert array back to Map for UI
      const savedInteractionsMap = new Map();
      savedData.forEach(([key, value]) => {
        savedInteractionsMap.set(key, value);
      });
      figma.ui.postMessage({
        type: 'saved-interactions-loaded',
        savedInteractions: Array.from(savedInteractionsMap.entries())
      });
    }
  } catch (error) {
    console.error('[PLUGIN] Error loading saved interactions:', error);
  }
}

// Load user curves from client storage on initialization
async function loadUserCurves() {
  try {
    const data = await figma.clientStorage.getAsync('aic-user-curves-v1');
    figma.ui.postMessage({
      type: 'user-curves-loaded',
      data: data || { userBezierCurves: [], userSpringCurves: [] }
    });
  } catch (error) {
    console.error('[PLUGIN] Error loading user curves:', error);
    figma.ui.postMessage({
      type: 'user-curves-loaded',
      data: { userBezierCurves: [], userSpringCurves: [] }
    });
  }
}

// Load data on initialization
loadSavedInteractions();
loadUserCurves();

// Persisted selection order across selection changes
let orderedSelectionIds: string[] = [];

function getOrderedSupportedSelection(): SceneNode[] {
  const selection = figma.currentPage.selection.filter(supportsInteractions);
  if (orderedSelectionIds.length === 0) {
    return selection;
  }
  const byId = new Map<string, SceneNode>(selection.map((node) => [node.id, node]));
  const inStoredOrder: SceneNode[] = [];
  for (const id of orderedSelectionIds) {
    const node = byId.get(id);
    if (node) inStoredOrder.push(node);
  }
  // Append any newly selected nodes that aren't in the stored list yet
  const remaining = selection.filter((n) => !orderedSelectionIds.includes(n.id));
  return [...inStoredOrder, ...remaining];
}

// Supported node types for interactions
function supportsInteractions(node: SceneNode): boolean {
  const supportedTypes = [
    'FRAME', 'COMPONENT', 'INSTANCE', 'COMPONENT_SET',
    'RECTANGLE', 'ELLIPSE', 'POLYGON', 'STAR', 'LINE', 'TEXT', 'VECTOR',
    'GROUP'
  ];
  return supportedTypes.includes(node.type);
}

// Resolve a node to an interactive target (e.g., map COMPONENT_SET to a child COMPONENT)
function resolveInteractiveNode(node: SceneNode): (SceneNode & ReactionMixin) | null {
  // If it's a component set, try to use its first component child
  if (node.type === 'COMPONENT_SET') {
    const set = node as ComponentSetNode;
    const firstComponent = set.children.find((child): child is ComponentNode => child.type === 'COMPONENT');
    if (firstComponent && 'reactions' in firstComponent) {
      return firstComponent as SceneNode & ReactionMixin;
    }
    return null;
  }
  return getReactionTargetNode(node);
}

// Find the nearest ancestor Frame to use as a valid navigation destination
function findNearestFrame(node: SceneNode | null): FrameNode | null {
  let current: BaseNode | null = node;
  while (current) {
    if ((current as SceneNode).type === 'FRAME') {
      return current as FrameNode;
    }
    current = (current as SceneNode).parent;
  }
  return null;
}

// Get reaction target node for setting interactions
function getReactionTargetNode(node: SceneNode): (SceneNode & ReactionMixin) | null {
  if (node.type === 'COMPONENT_SET') {
    // Defer to resolver for sets
    return resolveInteractiveNode(node);
  }
  if ('reactions' in node && supportsInteractions(node)) {
    return node as SceneNode & ReactionMixin;
  }
  return null;
}

// Collect interactive nodes to clear for a given selection node
function collectInteractiveNodesForRemoval(node: SceneNode): Array<SceneNode & ReactionMixin> {
  const result: Array<SceneNode & ReactionMixin> = [];

  // Helper to add a node if it supports reactions
  const maybeAdd = (n: SceneNode) => {
    if (hasReactions(n) && supportsInteractions(n)) {
      result.push(n as SceneNode & ReactionMixin);
    }
  };

  // For component sets: clear reactions on all child components (keep previous semantics)
  if (node.type === 'COMPONENT_SET') {
    const set = node as ComponentSetNode;
    for (const child of set.children) {
      if (child.type === 'COMPONENT') {
        maybeAdd(child as unknown as SceneNode);
      }
    }
    return result;
  }

  // For frames and sections: clear reactions on all interactive descendants (and the node itself if interactive)
  if (node.type === 'FRAME' || node.type === 'SECTION') {
    maybeAdd(node);
    const walk = (parent: SceneNode) => {
      if (hasChildren(parent)) {
        const children = (parent as any).children as readonly SceneNode[];
        for (const child of children) {
          if (child.type === 'COMPONENT_SET') {
            // Expand component sets to their child components
            const set = child as ComponentSetNode;
            for (const grand of set.children) {
              if (grand.type === 'COMPONENT') {
                maybeAdd(grand as unknown as SceneNode);
              }
            }
          } else {
            maybeAdd(child);
            // Recurse into any child containers (Frames, Groups, Components, Instances, etc.)
            if ('children' in (child as any)) {
              walk(child as SceneNode);
            }
          }
        }
      }
    };
    walk(node);
    return result;
  }

  // Default: only clear reactions on the node's reaction target
  const target = getReactionTargetNode(node);
  if (target) {
    result.push(target);
  }
  return result;
}

// Type for nodes with variant properties
type NodeWithVariants = SceneNode & {
  variantProperties?: VariantProperties;
  componentPropertyDefinitions?: ComponentPropertyDefinitions;
};

// Helpers for variant auto-detection (CHANGE_TO)
function getComponentSetParent(node: ComponentNode | null): ComponentSetNode | null {
  if (!node) return null;
  const parent = node.parent;
  if (parent && (parent as SceneNode).type === 'COMPONENT_SET') {
    return parent as ComponentSetNode;
  }
  return null;
}

async function getVariantComponentForChangeTo(node: SceneNode): Promise<ComponentNode | null> {
  if (node.type === 'COMPONENT') {
    return node as ComponentNode;
  }
  if (node.type === 'INSTANCE') {
    try {
      return await (node as InstanceNode).getMainComponentAsync();
    } catch {
      return null;
    }
  }
  return null;
}

function areSameComponentSet(a: ComponentNode | null, b: ComponentNode | null): boolean {
  const aSet = getComponentSetParent(a);
  const bSet = getComponentSetParent(b);
  return !!aSet && !!bSet && aSet === bSet;
}

function nodeMatchesVariantFilterByString(node: SceneNode, variantFilter: string[]): boolean {
  if (!variantFilter || variantFilter.length === 0) return true;
  const variantNode = node as NodeWithVariants;
  const props = variantNode.variantProperties;
  if (!props) return false;
  return variantFilter.some(filter => {
    const [propName, propValue] = filter.split(':');
    return props[propName] === propValue;
  });
}

// Parse list like ["Prop:Value", ...] to a map of prop -> set(values)
function parseVariantFiltersToMap(filters: string[] | undefined): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  if (!filters || filters.length === 0) return map;
  for (const f of filters) {
    const idx = f.indexOf(':');
    if (idx === -1) continue;
    const prop = f.slice(0, idx);
    const value = f.slice(idx + 1);
    if (!map.has(prop)) map.set(prop, new Set<string>());
    map.get(prop)!.add(value);
  }
  return map;
}

// Check node variantProperties satisfy ALL properties in map (AND across properties)
function nodeMatchesVariantMap(node: SceneNode, variantMap: Map<string, Set<string>>): boolean {
  const variantNode = node as NodeWithVariants;
  const props = variantNode.variantProperties;
  if (!props) return false;
  for (const [prop, values] of variantMap.entries()) {
    const nodeVal = props[prop];
    if (!nodeVal || !values.has(nodeVal)) return false;
  }
  return true;
}

// Collect nodes (components) matching the full variant map across selection
function collectNodesByVariantMap(baseNodes: SceneNode[], variantMap: Map<string, Set<string>>): SceneNode[] {
  const results: SceneNode[] = [];
  for (const node of baseNodes) {
    if (node.type === 'COMPONENT_SET') {
      const set = node as ComponentSetNode;
      for (const child of set.children) {
        if (child.type === 'COMPONENT' && nodeMatchesVariantMap(child as SceneNode, variantMap)) {
          results.push(child as SceneNode);
        }
      }
    } else if (nodeMatchesVariantMap(node, variantMap)) {
      results.push(node);
    }
  }
  return results;
}

// Determine which variant properties to use as pairing keys: properties where selection sets are equal
function getPairingProperties(fromMap: Map<string, Set<string>>, toMap: Map<string, Set<string>>): string[] {
  const props = new Set<string>([...fromMap.keys(), ...toMap.keys()]);
  const pairing: string[] = [];
  for (const prop of props) {
    const fromSet = fromMap.get(prop) || new Set<string>();
    const toSet = toMap.get(prop) || new Set<string>();
    // Compare sets for equality
    if (fromSet.size === toSet.size && [...fromSet].every(v => toSet.has(v))) {
      pairing.push(prop);
    }
  }
  return pairing;
}

function buildVariantKeyForNode(node: SceneNode, props: string[]): string {
  const variantNode = node as NodeWithVariants;
  const vp = variantNode.variantProperties || {};
  return props.map(p => `${p}=${vp[p] || ''}`).join('|');
}

// For update mode: expand a node to one or more ReactionMixin targets based on variant filter
function getUpdateTargetsForNode(node: SceneNode, variantFilter?: string[]): Array<SceneNode & ReactionMixin> {
  const targets: Array<SceneNode & ReactionMixin> = [];

  // Component set: include all child components that match variantFilter (or all if none)
  if (node.type === 'COMPONENT_SET') {
    const set = node as ComponentSetNode;
    for (const child of set.children) {
      if (child.type === 'COMPONENT' && 'reactions' in child) {
        if (!variantFilter || nodeMatchesVariantFilterByString(child, variantFilter)) {
          targets.push(child as unknown as SceneNode & ReactionMixin);
        }
      }
    }
    return targets;
  }

  // Component, Instance, or Frame: match by own variantProperties if filter provided
  // For nodes without variant properties (like FRAME), skip variant filter check
  const target = getReactionTargetNode(node);
  if (target) {
    const hasVariantProperties = 'variantProperties' in node && (node as NodeWithVariants).variantProperties;
    if (!variantFilter || !hasVariantProperties || nodeMatchesVariantFilterByString(node, variantFilter)) {
      targets.push(target);
    }
  }
  return targets;
}

// Filter nodes based on node IDs or variant properties
function filterNodes(nodes: SceneNode[], nodeFilter?: string[], variantFilter?: string[]): SceneNode[] {
  if (!nodeFilter && !variantFilter) {
    return nodes;
  }

  return nodes.filter(node => {
    // Node ID filtering
    if (nodeFilter && nodeFilter.length > 0) {
      return nodeFilter.includes(node.id);
    }

    // Variant property filtering
    if (variantFilter && variantFilter.length > 0) {
      // Check if node has variant properties
      const variantNode = node as NodeWithVariants;
      if (variantNode.variantProperties) {
        return variantFilter.some(filter => {
          const [propName, propValue] = filter.split(':');
          return variantNode.variantProperties![propName] === propValue;
        });
      }

      // Check if it's a component set with matching properties
      if (node.type === 'COMPONENT_SET') {
        const componentSet = node as ComponentSetNode & NodeWithVariants;
        if (componentSet.componentPropertyDefinitions) {
          return variantFilter.some(filter => {
            const [propName, propValue] = filter.split(':');
            const propDef = componentSet.componentPropertyDefinitions![propName];
            return propDef && propDef.type === 'VARIANT' && propDef.variantOptions?.includes(propValue);
          });
        }
      }
    }

    return false;
  });
}

// Get existing interactions from a node
async function getNodeInteractions(node: SceneNode): Promise<Array<{ trigger: string, delay: number, animation: string, curve: string, duration: number, targetId: string | null, targetName: string | null, direction: string | null, actionType: string | null, source?: 'component' | 'instance' | 'none' }>> {
  const targetNode = getReactionTargetNode(node);
  if (!targetNode || !targetNode.reactions) return [];

  // Determine if this is an instance and get component reactions
  let componentReactions: Reaction[] = [];
  let isInstance = false;
  let hasInstanceReactions = false;

  if (node.type === 'INSTANCE') {
    isInstance = true;
    hasInstanceReactions = targetNode.reactions && targetNode.reactions.length > 0;

    // Get component reactions to show component-level interactions
    try {
      const mainComponent = await (node as InstanceNode).getMainComponentAsync();
      if (mainComponent && 'reactions' in mainComponent && mainComponent.reactions) {
        componentReactions = [...mainComponent.reactions];
      }
    } catch (error) {
      console.log('[PLUGIN] Could not get main component for instance:', error);
    }
  }

  // Helper function to process a single reaction
  async function processReaction(reaction: Reaction, sourceNode: SceneNode, sourceType: 'component' | 'instance' | 'none'): Promise<{ trigger: string, delay: number, animation: string, curve: string, duration: number, targetId: string | null, targetName: string | null, direction: string | null, actionType: string | null, source: 'component' | 'instance' | 'none', stiffness?: number, damping?: number, mass?: number, bezierX1?: number, bezierY1?: number, bezierX2?: number, bezierY2?: number }> {
    const trigger = reaction.trigger?.type || 'ON_CLICK';
    // Handle different delay properties for different trigger types
    const delay = getTriggerDelay(reaction.trigger);
    const firstAction = getReactionAction(reaction);
    const transition = firstAction && isNodeAction(firstAction) ? firstAction.transition : null;

    let animation: string;
    let curve: string;
    let duration: number;
    let stiffnessValue: number | undefined;
    let dampingValue: number | undefined;
    let massValue: number | undefined;
    let bezierX1: number | undefined;
    let bezierY1: number | undefined;
    let bezierX2: number | undefined;
    let bezierY2: number | undefined;

    // If no transition exists, it's an instant animation
    if (!transition) {
      animation = 'INSTANT';
      curve = 'NONE';
      duration = 0;
    } else {
      // Check if it's DISSOLVE + LINEAR + ≤1ms (treat as INSTANT)
      const transitionType = transition.type || 'SMART_ANIMATE';
      const easingConfig = transition.easing;
      const easingType = easingConfig?.type || 'EASE_OUT';
      const transitionDuration = transition.duration ?? 0.3;

      if (transitionType === 'DISSOLVE' && easingType === 'LINEAR' && transitionDuration <= 0.001) {
        animation = 'INSTANT';
        curve = 'LINEAR';
        duration = 0.001;
      } else {
        animation = transitionType;
        curve = easingType === 'CUSTOM_CUBIC_BEZIER' ? 'CUSTOM_BEZIER' : easingType;
        duration = transitionDuration;

        if (curve === 'CUSTOM_BEZIER' && easingConfig?.easingFunctionCubicBezier) {
          bezierX1 = easingConfig.easingFunctionCubicBezier.x1;
          bezierY1 = easingConfig.easingFunctionCubicBezier.y1;
          bezierX2 = easingConfig.easingFunctionCubicBezier.x2;
          bezierY2 = easingConfig.easingFunctionCubicBezier.y2;
        }

        if (isSpringPresetName(curve)) {
          const preset = FIGMA_SPRING_PRESETS[curve];
          duration = preset.duration;
          stiffnessValue = preset.stiffness;
          dampingValue = preset.damping;
          massValue = preset.mass;
        } else if (curve === 'CUSTOM_SPRING' && easingConfig?.easingFunctionSpring) {
          const spring = easingConfig.easingFunctionSpring;
          stiffnessValue = spring.stiffness;
          dampingValue = spring.damping;
          massValue = spring.mass;
        }
      }
    }

    // Extract target information
    const targetId = firstAction && isNodeAction(firstAction) ? firstAction.destinationId : null;
    const actionType = firstAction?.type || null;
    let direction = null;
    let targetName = null;

    if (targetId) {
      try {
        const targetDestination = await figma.getNodeByIdAsync(targetId) as SceneNode;
        if (targetDestination) {
          targetName = targetDestination.name;
          if (sourceNode) {
            direction = calculateDirection(sourceNode, targetDestination);
          }
        }
      } catch (error) {
        console.log('[PLUGIN] Could not resolve target destination for direction calculation');
      }
    }

    return { trigger, delay, animation, curve, duration, targetId, targetName, direction, actionType, source: sourceType, stiffness: stiffnessValue, damping: dampingValue, mass: massValue, bezierX1, bezierY1, bezierX2, bezierY2 };
  }

  // For instances: determine which reactions are component-level vs instance overrides
  // For non-instances: show normal interactions
  if (isInstance) {
    // Process all instance reactions and determine their source by comparing with component
    const allInstanceReactions = targetNode.reactions || [];

    // Create a normalization function for comparing reactions
    const normalizeReactionForComparison = (r: Reaction) => {
      const trigger = r.trigger?.type || 'ON_CLICK';
      const delay = getTriggerDelay(r.trigger);
      const firstAction = getReactionAction(r);
      const targetId = firstAction && isNodeAction(firstAction) ? firstAction.destinationId : null;
      const actionType = firstAction?.type || null;
      return `${trigger}:${delay}:${targetId}:${actionType}`;
    };

    // Create a set of normalized component reaction keys
    const componentReactionKeys = new Set(
      componentReactions.map(normalizeReactionForComparison)
    );

    // Process each instance reaction and determine if it's component-level or override
    const processedInteractions = await Promise.all(
      allInstanceReactions.map(async (reaction) => {
        const normalizedKey = normalizeReactionForComparison(reaction);
        // If this reaction exists in component, it's component-level; otherwise it's an override
        const source: 'component' | 'instance' = componentReactionKeys.has(normalizedKey)
          ? 'component'
          : 'instance';
        return await processReaction(reaction, node, source);
      })
    );

    return processedInteractions;
  } else {
    // For non-instance nodes, process normally
    const sourceType = node.type === 'COMPONENT' ? 'component' : 'none';
    return await Promise.all(targetNode.reactions.map(async (reaction) => {
      return await processReaction(reaction, node, sourceType);
    }));
  }
}

// Create transition object
function createTransition(
  animation: string,
  duration: number,
  easing: string,
  bezierValues?: { x1: number, y1: number, x2: number, y2: number },
  springValues?: { stiffness: number, damping: number, mass: number }
): Transition | null {
  // Handle INSTANT animation - convert to DISSOLVE + LINEAR + 1ms
  if (animation === 'INSTANT') {
    animation = 'DISSOLVE';
    easing = 'LINEAR';
    duration = 0.001; // 1ms in seconds
  }

  const validAnimations = ['DISSOLVE', 'SMART_ANIMATE', 'MOVE_IN', 'MOVE_OUT', 'PUSH', 'SLIDE_IN', 'SLIDE_OUT'];
  const validEasings = [
    'EASE_IN', 'EASE_OUT', 'EASE_IN_AND_OUT', 'LINEAR',
    'EASE_IN_BACK', 'EASE_OUT_BACK', 'EASE_IN_AND_OUT_BACK',
    'CUSTOM_BEZIER', 'GENTLE', 'QUICK', 'BOUNCY', 'SLOW', 'CUSTOM_SPRING'
  ];

  if (!validAnimations.includes(animation)) animation = 'SMART_ANIMATE';
  if (!validEasings.includes(easing)) easing = 'EASE_OUT';

  if (isSpringPresetName(easing)) {
    duration = FIGMA_SPRING_PRESETS[easing].duration;
  }

  let easingObj: Easing;

  // Handle custom spring curves
  if (easing === 'CUSTOM_SPRING') {
    let springParams;
    if (springValues) {
      springParams = springValues;
    } else {
      // Default custom spring values
      springParams = { stiffness: 100, damping: 15, mass: 1 };
    }

    easingObj = {
      type: 'CUSTOM_SPRING',
      easingFunctionSpring: {
        stiffness: springParams.stiffness,
        damping: springParams.damping,
        mass: springParams.mass
      }
    } as Easing;
  }
  // Handle Figma spring presets (GENTLE, QUICK, BOUNCY, SLOW) - send as native types
  else if (['GENTLE', 'QUICK', 'BOUNCY', 'SLOW'].includes(easing)) {
    easingObj = { type: easing } as Easing;
  }
  // Handle custom bezier curves
  else if (easing === 'CUSTOM_BEZIER' && bezierValues) {
    easingObj = {
      type: 'CUSTOM_CUBIC_BEZIER',
      easingFunctionCubicBezier: {
        x1: bezierValues.x1,
        y1: bezierValues.y1,
        x2: bezierValues.x2,
        y2: bezierValues.y2
      }
    } as Easing;
  }
  // Handle standard easing curves
  else {
    easingObj = { type: easing } as Easing;
  }

  return {
    type: animation as any,
    duration: Math.max(0, duration), // Duration already in seconds as expected by Figma API
    easing: easingObj
  };
}

// Create trigger object
function createTrigger(triggerType: string, delay: number = 0): Trigger {
  const validTriggers = ['ON_CLICK', 'ON_DRAG', 'ON_HOVER', 'ON_PRESS', 'AFTER_TIMEOUT', 'MOUSE_ENTER', 'MOUSE_LEAVE', 'MOUSE_DOWN', 'MOUSE_UP'];

  if (!validTriggers.includes(triggerType)) triggerType = 'ON_CLICK';

  const trigger: Trigger = { type: triggerType as any };

  // Set delay for triggers that support it
  const triggersWithDelay = ['AFTER_TIMEOUT', 'MOUSE_ENTER', 'MOUSE_LEAVE', 'MOUSE_DOWN', 'MOUSE_UP'];
  if (triggersWithDelay.includes(triggerType)) {
    if (triggerType === 'AFTER_TIMEOUT') {
      (trigger as any).timeout = Math.max(0, delay);
    } else {
      (trigger as any).delay = Math.max(0, delay);
    }
  }

  return trigger;
}

// Send selected layers info to UI
async function sendLayersToUI() {
  const supportedLayers: LayerInfo[] = [];

  // Use persisted selection ordering
  const supportedNodes = getOrderedSupportedSelection();

  // Create layers array with explicit ordering
  for (const node of supportedNodes) {
    // If a component set is selected, expand to its variant COMPONENT children in the Selected Layers list
    if (node.type === 'COMPONENT_SET') {
      const set = node as ComponentSetNode;
      const children = set.children.filter((c): c is ComponentNode => c.type === 'COMPONENT');
      for (const child of children) {
        const interactions = await getNodeInteractions(child as unknown as SceneNode);
        const childInfo: LayerInfo = {
          id: child.id,
          name: child.name,
          type: child.type,
          interactions: interactions,
          variantProperties: (child as NodeWithVariants).variantProperties || null
        };
        supportedLayers.push(childInfo);
      }
    } else {
      const interactions = await getNodeInteractions(node);
      const layerInfo: LayerInfo = {
        id: node.id,
        name: node.name,
        type: node.type,
        interactions: interactions
      };

      // Add variant properties if available
      const variantNode = node as NodeWithVariants;
      if (variantNode.variantProperties) {
        layerInfo.variantProperties = variantNode.variantProperties;
      }

      supportedLayers.push(layerInfo);
    }
  }

  // Also include selected Sections (for UI visibility and remove button state)
  const rawSelection = figma.currentPage.selection as SceneNode[];
  rawSelection.forEach((node) => {
    if (node.type === 'SECTION' || node.type === 'GROUP') {
      const layerInfo: LayerInfo = {
        id: node.id,
        name: node.name,
        type: node.type,
        interactions: []
      };
      supportedLayers.push(layerInfo);
    }
  });

  figma.ui.postMessage({
    type: 'selection-changed',
    layers: supportedLayers
  });
}

// Helper function to sort nodes by position based on direction (row/column grouping with tolerance)
function sortNodesByPosition(nodes: SceneNode[], direction: string): SceneNode[] {
  // For component sets, use their children nodes for position calculation
  const expandedNodes: SceneNode[] = [];
  nodes.forEach((node: SceneNode) => {
    if (node.type === 'COMPONENT_SET') {
      const componentSetNode = node as ComponentSetNode;
      componentSetNode.children.forEach((child: SceneNode) => {
        if (child.type === 'COMPONENT') {
          expandedNodes.push(child);
        }
      });
    } else {
      expandedNodes.push(node);
    }
  });

  // Compute absolute center positions for robust cross-container comparisons
  type Positioned = {
    node: SceneNode;
    cx: number;
    cy: number;
    w: number;
    h: number;
  };

  const items: Positioned[] = expandedNodes.map((n) => {
    if (!hasLayout(n)) {
      return { node: n, cx: 0, cy: 0, w: 0, h: 0 };
    }
    const t = n.absoluteTransform;
    const absX = t ? t[0][2] : n.x;
    const absY = t ? t[1][2] : n.y;
    const w = n.width || 0;
    const h = n.height || 0;
    return {
      node: n,
      cx: absX + w / 2,
      cy: absY + h / 2,
      w,
      h,
    };
  });

  // Configure grouping and traversal so flow follows the chosen direction
  type AxisKey = 'cx' | 'cy';
  let groupingKey: AxisKey;      // axis used to form groups (columns for vertical, rows for horizontal)
  let traverseKey: AxisKey;      // axis used to order within a group (directional flow)
  let groupsAscendingKey: AxisKey; // axis used to order groups themselves (natural reading order)
  let withinAscending = true;    // whether traversal within a group is ascending or descending

  if (direction === 'top-to-bottom') {
    // Traverse down within each column; columns ordered left-to-right
    groupingKey = 'cx';
    traverseKey = 'cy';
    groupsAscendingKey = 'cx';
    withinAscending = true;
  } else if (direction === 'bottom-to-top') {
    // Traverse up within each column; columns ordered left-to-right
    groupingKey = 'cx';
    traverseKey = 'cy';
    groupsAscendingKey = 'cx';
    withinAscending = false;
  } else if (direction === 'left-to-right') {
    // Traverse right within each row; rows ordered top-to-bottom
    groupingKey = 'cy';
    traverseKey = 'cx';
    groupsAscendingKey = 'cy';
    withinAscending = true;
  } else {
    // 'right-to-left': Traverse left within each row; rows ordered top-to-bottom
    groupingKey = 'cy';
    traverseKey = 'cx';
    groupsAscendingKey = 'cy';
    withinAscending = false;
  }

  // Dynamic tolerance based on median size on the grouping axis
  const sizes = items.map((it) => (groupingKey === 'cx' ? it.w : it.h)).filter((s) => s > 0);
  const median = (() => {
    if (sizes.length === 0) return 0;
    const sorted = sizes.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  })();
  const tolerance = Math.max(4, median * 0.6);

  // First, sort by grouping axis ascending to form groups
  items.sort((a, b) => (a[groupingKey] - b[groupingKey]));

  // Group by grouping axis using tolerance (columns for vertical flows, rows for horizontal flows)
  const groups: Positioned[][] = [];
  let currentGroup: Positioned[] = [];
  let groupBaseline = Number.NEGATIVE_INFINITY;

  for (const it of items) {
    if (currentGroup.length === 0) {
      currentGroup.push(it);
      groupBaseline = it[groupingKey];
    } else if (Math.abs(it[groupingKey] - groupBaseline) <= tolerance) {
      currentGroup.push(it);
    } else {
      groups.push(currentGroup);
      currentGroup = [it];
      groupBaseline = it[groupingKey];
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  // Sort within each group along the traversal axis, ascending or descending per direction
  groups.forEach((g) => g.sort((a, b) => (withinAscending ? (a[traverseKey] - b[traverseKey]) : (b[traverseKey] - a[traverseKey]))));

  // Sort groups themselves in natural reading order (ascending on the perpendicular axis)
  groups.sort((a, b) => a[0][groupsAscendingKey] - b[0][groupsAscendingKey]);

  // Flatten back to node list
  const result: SceneNode[] = [];
  for (const g of groups) {
    for (const it of g) {
      result.push(it.node);
    }
  }

  return result;
}

// Helper function to create position-based pairs with group chain logic
function createPositionPairs(nodes: SceneNode[], groupSize: number, direction: string, skip: number = 0): Array<{ from: SceneNode, to: SceneNode }> {
  const pairs: Array<{ from: SceneNode, to: SceneNode }> = [];

  // Recompute positions to detect grouping boundaries (rows/columns) identical to sorting logic
  type Positioned = {
    node: SceneNode;
    cx: number;
    cy: number;
    w: number;
    h: number;
  };

  const items: Positioned[] = nodes.map((n) => {
    if (!hasLayout(n)) {
      return { node: n, cx: 0, cy: 0, w: 0, h: 0 };
    }
    const t = n.absoluteTransform;
    const absX = t ? t[0][2] : n.x;
    const absY = t ? t[1][2] : n.y;
    const w = n.width || 0;
    const h = n.height || 0;
    return {
      node: n,
      cx: absX + w / 2,
      cy: absY + h / 2,
      w,
      h,
    };
  });

  type AxisKey = 'cx' | 'cy';
  let groupingKey: AxisKey;
  let traverseKey: AxisKey;
  let groupsAscendingKey: AxisKey;
  let withinAscending = true;

  if (direction === 'top-to-bottom') {
    groupingKey = 'cx';
    traverseKey = 'cy';
    groupsAscendingKey = 'cx';
    withinAscending = true;
  } else if (direction === 'bottom-to-top') {
    groupingKey = 'cx';
    traverseKey = 'cy';
    groupsAscendingKey = 'cx';
    withinAscending = false;
  } else if (direction === 'left-to-right') {
    groupingKey = 'cy';
    traverseKey = 'cx';
    groupsAscendingKey = 'cy';
    withinAscending = true;
  } else {
    groupingKey = 'cy';
    traverseKey = 'cx';
    groupsAscendingKey = 'cy';
    withinAscending = false;
  }

  const sizes = items.map((it) => (groupingKey === 'cx' ? it.w : it.h)).filter((s) => s > 0);
  const median = (() => {
    if (sizes.length === 0) return 0;
    const sorted = sizes.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  })();
  const tolerance = Math.max(4, median * 0.6);

  // Build groups by grouping axis
  items.sort((a, b) => (a[groupingKey] - b[groupingKey]));
  const groups: Positioned[][] = [];
  let currentGroup: Positioned[] = [];
  let groupBaseline = Number.NEGATIVE_INFINITY;
  for (const it of items) {
    if (currentGroup.length === 0) {
      currentGroup.push(it);
      groupBaseline = it[groupingKey];
    } else if (Math.abs(it[groupingKey] - groupBaseline) <= tolerance) {
      currentGroup.push(it);
    } else {
      groups.push(currentGroup);
      currentGroup = [it];
      groupBaseline = it[groupingKey];
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  // Order groups and members as per direction
  groups.sort((a, b) => a[0][groupsAscendingKey] - b[0][groupsAscendingKey]);
  groups.forEach((g) => g.sort((a, b) => (withinAscending ? (a[traverseKey] - b[traverseKey]) : (b[traverseKey] - a[traverseKey]))));

  // For each group, connect in chunks of size groupSize, then skip K items before next chunk
  const stride = Math.max(1, Math.floor(groupSize) + Math.max(0, Math.floor(skip)));
  for (const g of groups) {
    for (let start = 0; start < g.length; start += stride) {
      const chunkEnd = Math.min(start + groupSize, g.length);
      for (let i = start; i < chunkEnd - 1; i++) {
        pairs.push({ from: g[i].node, to: g[i + 1].node });
      }
    }
  }

  return pairs;
}

// Extract target information from a layer's interactions
async function extractInteractionTargetInfo(layerId: string): Promise<{ targetId: string | null, direction: string | null }> {
  try {
    const node = await figma.getNodeByIdAsync(layerId) as SceneNode;
    if (!node) return { targetId: null, direction: null };

    const targetNode = getReactionTargetNode(node);
    if (!targetNode || !targetNode.reactions || targetNode.reactions.length === 0) {
      return { targetId: null, direction: null };
    }

    // Get the first reaction
    const reaction = targetNode.reactions[0];
    const firstAction = getReactionAction(reaction);
    const targetId = firstAction && isNodeAction(firstAction) ? firstAction.destinationId : null;

    // Calculate direction if we have a target
    let direction = null;
    if (targetId) {
      try {
        const targetDestination = await figma.getNodeByIdAsync(targetId) as SceneNode;
        if (targetDestination && node) {
          direction = calculateDirection(node, targetDestination);
        }
      } catch (error) {
        console.log('[PLUGIN] Could not resolve target destination for direction calculation');
      }
    }

    return { targetId, direction };
  } catch (error) {
    console.error('[PLUGIN] Error extracting interaction target info:', error);
    return { targetId: null, direction: null };
  }
}

// Find a node in a specific direction from a source node
async function findNodeInDirection(sourceNode: SceneNode, direction: string): Promise<SceneNode | null> {
  try {
    // Get all nodes on the current page that support interactions
    const allNodes = figma.currentPage.findAll(node => supportsInteractions(node as SceneNode)) as SceneNode[];

    // Get source node position
    if (!hasLayout(sourceNode)) {
      return null;
    }
    const sourceTransform = sourceNode.absoluteTransform;
    const sourceX = sourceTransform ? sourceTransform[0][2] : sourceNode.x || 0;
    const sourceY = sourceTransform ? sourceTransform[1][2] : sourceNode.y || 0;
    const sourceWidth = sourceNode.width || 0;
    const sourceHeight = sourceNode.height || 0;
    const sourceCenterX = sourceX + sourceWidth / 2;
    const sourceCenterY = sourceY + sourceHeight / 2;

    let bestCandidate: SceneNode | null = null;
    let bestDistance = Infinity;

    for (const candidate of allNodes) {
      if (candidate.id === sourceNode.id) continue; // Skip self

      // Get candidate position
      const candidateTransform = candidate.absoluteTransform;
      const candidateX = candidateTransform ? candidateTransform[0][2] : candidate.x || 0;
      const candidateY = candidateTransform ? candidateTransform[1][2] : candidate.y || 0;
      const candidateWidth = candidate.width || 0;
      const candidateHeight = candidate.height || 0;
      const candidateCenterX = candidateX + candidateWidth / 2;
      const candidateCenterY = candidateY + candidateHeight / 2;

      // Check if candidate is in the right direction
      const deltaX = candidateCenterX - sourceCenterX;
      const deltaY = candidateCenterY - sourceCenterY;

      let isInDirection = false;
      switch (direction) {
        case 'right':
          isInDirection = deltaX > 0 && Math.abs(deltaY) < Math.abs(deltaX);
          break;
        case 'left':
          isInDirection = deltaX < 0 && Math.abs(deltaY) < Math.abs(deltaX);
          break;
        case 'below':
          isInDirection = deltaY > 0 && Math.abs(deltaX) < Math.abs(deltaY);
          break;
        case 'above':
          isInDirection = deltaY < 0 && Math.abs(deltaX) < Math.abs(deltaY);
          break;
      }

      if (isInDirection) {
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestCandidate = candidate;
        }
      }
    }

    return bestCandidate;
  } catch (error) {
    console.error('[PLUGIN] Error finding node in direction:', error);
    return null;
  }
}

// Apply step incremental values to settings
function applyStepIncrementalToSettings(
  baseSettings: InteractionSettings,
  nodeIndex: number,
  stepIncremental?: StepIncrementalConfig
): InteractionSettings {
  if (!stepIncremental) return baseSettings;

  const newSettings = { ...baseSettings };

  // Apply delay step incremental values
  if (stepIncremental.delay && stepIncremental.delay.values && nodeIndex < stepIncremental.delay.values.length) {
    newSettings.delay = stepIncremental.delay.values[nodeIndex];
  }

  // Apply duration step incremental values
  if (stepIncremental.duration && stepIncremental.duration.values && nodeIndex < stepIncremental.duration.values.length) {
    newSettings.duration = stepIncremental.duration.values[nodeIndex];
  }

  return newSettings;
}

// Sort nodes for step incremental based on position if needed
function sortNodesForStepIncremental(
  nodes: SceneNode[],
  stepIncremental?: StepIncrementalConfig
): SceneNode[] {
  // If any step incremental setting uses position mode, sort by position
  const usePositionSorting = stepIncremental && (
    (stepIncremental.delay?.settings.mode === 'position') ||
    (stepIncremental.duration?.settings.mode === 'position')
  );

  if (!usePositionSorting) {
    return nodes;
  }

  // Use the first position-based setting found for direction
  let direction = 'top-to-bottom';
  let positionSettings = stepIncremental.delay?.settings || stepIncremental.duration?.settings;

  if (positionSettings && positionSettings.mode === 'position') {
    if (positionSettings.positionLayout === 'row') {
      direction = positionSettings.positionHorizontal === 'left-to-right' ?
        'left-to-right' : 'right-to-left';
    } else {
      direction = positionSettings.positionVertical === 'top-to-bottom' ?
        'top-to-bottom' : 'bottom-to-top';
    }
  }

  return sortNodesByPosition(nodes, direction);
}

// Calculate relative direction between two nodes
function calculateDirection(fromNode: SceneNode, toNode: SceneNode): string | null {
  try {
    // Get positions - use absoluteTransform if available, otherwise fallback to x/y
    if (!hasLayout(fromNode) || !hasLayout(toNode)) {
      return null;
    }
    const fromTransform = fromNode.absoluteTransform;
    const toTransform = toNode.absoluteTransform;

    const fromX = fromTransform ? fromTransform[0][2] : fromNode.x || 0;
    const fromY = fromTransform ? fromTransform[1][2] : fromNode.y || 0;
    const fromWidth = fromNode.width || 0;
    const fromHeight = fromNode.height || 0;

    const toX = toTransform ? toTransform[0][2] : toNode.x || 0;
    const toY = toTransform ? toTransform[1][2] : toNode.y || 0;
    const toWidth = toNode.width || 0;
    const toHeight = toNode.height || 0;

    // Calculate center points
    const fromCenterX = fromX + fromWidth / 2;
    const fromCenterY = fromY + fromHeight / 2;
    const toCenterX = toX + toWidth / 2;
    const toCenterY = toY + toHeight / 2;

    // Calculate differences
    const deltaX = toCenterX - fromCenterX;
    const deltaY = toCenterY - fromCenterY;

    // Determine primary direction based on larger delta
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      return deltaX > 0 ? 'right' : 'left';
    } else {
      return deltaY > 0 ? 'below' : 'above';
    }
  } catch (error) {
    console.error('[PLUGIN] Error calculating direction:', error);
    return 'unknown';
  }
}

// Save interaction with target information
async function saveInteractionInfo(
  layerId: string,
  savedId: string,
  interaction: any,
  layerName: string
): Promise<boolean> {
  try {
    // Extract target information
    const { targetId, direction } = await extractInteractionTargetInfo(layerId);

    const savedInteraction = {
      id: savedId,
      name: `${layerName} Interaction`,
      originalLayerId: layerId,
      originalLayerName: layerName,
      interaction: {
        trigger: interaction.trigger,
        delay: interaction.delay,
        animation: interaction.animation,
        curve: interaction.curve,
        duration: interaction.duration
      },
      savedAt: new Date().toISOString(),
      originalTargetId: targetId,
      originalDirection: direction
    };

    // Save to client storage
    try {
      const existingData = await figma.clientStorage.getAsync('savedInteractions') || [];
      const savedInteractionsMap = new Map(existingData);
      savedInteractionsMap.set(savedId, savedInteraction);
      await figma.clientStorage.setAsync('savedInteractions', Array.from(savedInteractionsMap.entries()));
    } catch (storageError) {
      console.error('[PLUGIN] Error saving to client storage:', storageError);
      // Continue with UI update even if storage fails
    }

    // Send the saved interaction back to UI
    figma.ui.postMessage({
      type: 'interaction-saved',
      savedId: savedId,
      savedInteraction: savedInteraction
    });

    return true;
  } catch (error) {
    console.error('[PLUGIN] Error saving interaction info:', error);
    figma.ui.postMessage({ type: 'error', message: 'Failed to save interaction information.' });
    return false;
  }
}

// Apply saved interaction to target nodes
async function applySavedInteraction(
  settings: InteractionSettings,
  applicationMode: 'by-order' | 'same-target',
  targetLayerIds: string[],
  savedInteractionData?: any
): Promise<boolean> {
  try {
    // Get target nodes by IDs
    const targetNodes: SceneNode[] = [];
    for (const id of targetLayerIds) {
      const node = await figma.getNodeByIdAsync(id) as SceneNode;
      if (node && supportsInteractions(node)) {
        targetNodes.push(node);
      }
    }

    if (targetNodes.length === 0) {
      figma.ui.postMessage({ type: 'error', message: 'No valid target nodes found.' });
      return false;
    }

    console.log(`[PLUGIN] Applying saved interaction with mode: ${applicationMode}`);
    console.log(`[PLUGIN] Target nodes:`, targetNodes.map(n => n.name));

    if (applicationMode === 'by-order') {
      // Apply interaction using By Order logic (chain interactions)
      for (let i = 0; i < targetNodes.length - 1; i++) {
        const sourceNode = getReactionTargetNode(targetNodes[i]) || resolveInteractiveNode(targetNodes[i]);
        if (!sourceNode) continue;

        const trigger = createTrigger(settings.trigger, settings.delay);
        const bezierValues = settings.curve === 'CUSTOM_BEZIER' ? {
          x1: settings.bezierX1 || 0.25,
          y1: settings.bezierY1 || 0.1,
          x2: settings.bezierX2 || 0.25,
          y2: settings.bezierY2 || 1
        } : undefined;
        const springValues = (settings.curve === 'CUSTOM_SPRING' || ['GENTLE', 'QUICK', 'BOUNCY', 'SLOW'].includes(settings.curve)) ? {
          stiffness: settings.stiffness || 100,
          damping: settings.damping || 15,
          mass: settings.mass || 1
        } : undefined;
        const transition = createTransition(settings.animation, settings.duration, settings.curve, bezierValues, springValues);

        if (!transition) continue;

        // Decide between CHANGE_TO (variants of same set) vs NAVIGATE (frames)
        const sourceVariant = await getVariantComponentForChangeTo(targetNodes[i]);
        const targetVariant = await getVariantComponentForChangeTo(targetNodes[i + 1]);
        const canChangeTo = areSameComponentSet(sourceVariant, targetVariant) &&
          targetNodes[i].type !== 'INSTANCE' && targetNodes[i + 1].type !== 'INSTANCE';

        if (canChangeTo && targetVariant) {
          const newReaction: Reaction = {
            actions: [{
              type: 'NODE',
              destinationId: targetVariant.id,
              navigation: 'CHANGE_TO',
              transition: transition,
              preserveScrollPosition: false
            }],
            trigger: trigger
          };
          const currentReactions = sourceNode.reactions || [];
          await sourceNode.setReactionsAsync([...currentReactions, newReaction]);
        } else {
          const targetResolved = resolveInteractiveNode(targetNodes[i + 1]);
          const rawTarget = (targetResolved as unknown as SceneNode) || targetNodes[i + 1];
          const targetFrame = findNearestFrame(rawTarget);
          const destinationId = targetFrame ? targetFrame.id : rawTarget.id;

          if (destinationId) {
            const newReaction: Reaction = {
              actions: [{
                type: 'NODE',
                destinationId: destinationId,
                navigation: 'NAVIGATE',
                transition: transition,
                preserveScrollPosition: false
              }],
              trigger: trigger
            };
            const currentReactions = sourceNode.reactions || [];
            await sourceNode.setReactionsAsync([...currentReactions, newReaction]);
          }
        }
      }
    } else if (applicationMode === 'same-target') {
      // Apply interaction to connect to the same target as original for each selected node
      const trigger = createTrigger(settings.trigger, settings.delay);
      const bezierValues = settings.curve === 'CUSTOM_BEZIER' ? {
        x1: settings.bezierX1 || 0.25,
        y1: settings.bezierY1 || 0.1,
        x2: settings.bezierX2 || 0.25,
        y2: settings.bezierY2 || 1
      } : undefined;
      const springValues = (settings.curve === 'CUSTOM_SPRING' || ['GENTLE', 'QUICK', 'BOUNCY', 'SLOW'].includes(settings.curve)) ? {
        stiffness: settings.stiffness || 100,
        damping: settings.damping || 15,
        mass: settings.mass || 1
      } : undefined;
      const transition = createTransition(settings.animation, settings.duration, settings.curve, bezierValues, springValues);

      if (!transition) {
        figma.ui.postMessage({ type: 'error', message: 'Failed to create transition for same-target application.' });
        return false;
      }

      const originalTargetId = savedInteractionData?.originalTargetId as string | undefined;
      if (!originalTargetId) {
        figma.ui.postMessage({ type: 'error', message: 'Saved interaction has no original target to connect to.' });
        return false;
      }

      const originalTargetNode = await figma.getNodeByIdAsync(originalTargetId) as SceneNode | null;
      if (!originalTargetNode) {
        figma.ui.postMessage({ type: 'error', message: 'Original target node could not be found.' });
        return false;
      }

      let createdCount = 0;
      for (const tn of targetNodes) {
        const sourceNode = getReactionTargetNode(tn) || resolveInteractiveNode(tn);
        if (!sourceNode) continue;

        // Decide between CHANGE_TO (variants of same set) vs NAVIGATE (frames) per source
        const sourceVariant = await getVariantComponentForChangeTo(tn);
        const targetVariant = await getVariantComponentForChangeTo(originalTargetNode);
        const canChangeTo = areSameComponentSet(sourceVariant, targetVariant) &&
          tn.type !== 'INSTANCE' && originalTargetNode.type !== 'INSTANCE';

        let destinationId: string | null = null;
        let navigation: any = 'NAVIGATE';

        if (canChangeTo && targetVariant) {
          destinationId = targetVariant.id;
          navigation = 'CHANGE_TO';
        } else {
          const targetResolved = resolveInteractiveNode(originalTargetNode);
          const rawTarget = (targetResolved as unknown as SceneNode) || originalTargetNode;
          const targetFrame = findNearestFrame(rawTarget);
          destinationId = targetFrame ? targetFrame.id : rawTarget.id;
          navigation = 'NAVIGATE';
        }

        if (!destinationId) continue;

        const newReaction: Reaction = {
          actions: [{
            type: 'NODE',
            destinationId: destinationId,
            navigation: navigation,
            transition: transition,
            preserveScrollPosition: false
          }],
          trigger: trigger
        };
        const currentReactions = sourceNode.reactions || [];
        await sourceNode.setReactionsAsync([...currentReactions, newReaction]);
        createdCount++;
      }

      if (createdCount === 0) {
        figma.ui.postMessage({ type: 'error', message: 'No valid nodes could be connected using Same Target.' });
        return false;
      }
    } else if (false) {
      // same-direction removed
    }

    const successMessage = `Saved interaction applied to ${targetNodes.length} node(s) using ${applicationMode} mode.`;
    figma.ui.postMessage({ type: 'saved-interaction-applied', message: successMessage });
    return true;

  } catch (error) {
    console.error('[PLUGIN] applySavedInteraction error', error);
    figma.ui.postMessage({ type: 'error', message: `Failed to apply saved interaction: ${error}` });
    return false;
  }
}

// Apply interactions to selected nodes
async function applyInteractions(
  mode: string,
  settings: InteractionSettings,
  triggerType?: string,
  nodeFilter?: string[],
  variantFilter?: string[],
  fromList?: string[],
  toList?: string[],
  fromVariantFilter?: string[],
  toVariantFilter?: string[],
  propertyMappingConfig?: PropertyMappingConfig,
  positionConfig?: PositionConfig,
  stepIncremental?: StepIncrementalConfig,
  orderMode?: 'selection' | 'layer',
  orderReverse?: boolean,
  updateSource?: 'component' | 'instance' | 'instance-remove-variant'
): Promise<boolean> {
  let supportedNodes = getOrderedSupportedSelection();

  // Apply filtering in update mode
  if (mode === 'update' && (nodeFilter || variantFilter)) {
    supportedNodes = filterNodes(supportedNodes, nodeFilter, variantFilter);
  }

  if (supportedNodes.length < 1) {
    figma.ui.postMessage({ type: 'error', message: 'Please select at least one supported layer.' });
    return false;
  }

  // Log interaction chain for add mode to help users understand the flow
  if (mode === 'add' && supportedNodes.length > 1) {
    console.log('🎯 Interaction chain that will be created:');
    supportedNodes.forEach((node, index) => {
      const nextIndex = index + 1;
      if (nextIndex < supportedNodes.length) {
        console.log(`  ${index + 1}. ${node.name} → ${supportedNodes[nextIndex].name}`);
      } else {
        console.log(`  ${index + 1}. ${node.name} (end of chain)`);
      }
    });
  }

  let interactionsCreated = 0;
  let interactionsUpdated = 0;

  try {
    console.log('[PLUGIN] applyInteractions start', {
      mode,
      triggerType,
      hasNodeFilter: !!nodeFilter?.length,
      hasVariantFilter: !!variantFilter?.length,
      hasFromList: !!fromList?.length,
      hasToList: !!toList?.length,
      hasFromVariantFilter: !!fromVariantFilter?.length,
      hasToVariantFilter: !!toVariantFilter?.length,
      hasPropertyMapping: !!propertyMappingConfig,
      propertyMappingConfig
    });
    if (mode === 'update') {
      // Sort nodes for step incremental if needed
      supportedNodes = sortNodesForStepIncremental(supportedNodes, stepIncremental);

      // Update existing interactions
      for (let nodeIndex = 0; nodeIndex < supportedNodes.length; nodeIndex++) {
        const node = supportedNodes[nodeIndex];
        const targets = getUpdateTargetsForNode(node, variantFilter);

        // Apply step incremental values to settings for this node
        const nodeSettings = applyStepIncrementalToSettings(settings, nodeIndex, stepIncremental);

        for (const targetNode of targets) {
          // Determine which node to update based on updateSource
          let nodeToUpdate: SceneNode & ReactionMixin = targetNode;
          let reactionsToCompare: Reaction[] = [];

          if (updateSource && node.type === 'INSTANCE') {
            try {
              const mainComponent = await (node as InstanceNode).getMainComponentAsync();
              if (mainComponent && 'reactions' in mainComponent) {
                if (updateSource === 'component') {
                  // Update component reactions - compare with instance to find component-only reactions
                  nodeToUpdate = mainComponent as SceneNode & ReactionMixin;
                  reactionsToCompare = targetNode.reactions ? [...targetNode.reactions] : []; // Compare with instance reactions
                } else if (updateSource === 'instance' || updateSource === 'instance-remove-variant') {
                  // Update instance reactions - compare with component to find instance-only reactions
                  reactionsToCompare = mainComponent.reactions ? [...mainComponent.reactions] : []; // Compare with component reactions
                }
              }
            } catch (error) {
              console.log('[PLUGIN] Could not get main component for source filtering:', error);
            }
          }

          // Get current reactions from the node we're updating
          const currentReactions = nodeToUpdate.reactions || [];
          let reactionsToUpdate: readonly Reaction[] = [];
          let reactionsToKeep: readonly Reaction[] = [];

          // Create a function to normalize reactions for comparison (used for source filtering)
          const normalizeReaction = (r: Reaction) => {
            const trigger = r.trigger?.type || 'ON_CLICK';
            const delay = getTriggerDelay(r.trigger);
            const firstAction = getReactionAction(r);
            const targetId = firstAction && isNodeAction(firstAction) ? firstAction.destinationId : null;
            return `${trigger}:${delay}:${targetId}`;
          };

          // If updateSource is specified for instances, we need to separate component vs instance reactions
          if (updateSource && node.type === 'INSTANCE' && reactionsToCompare.length > 0 && (updateSource === 'instance' || updateSource === 'instance-remove-variant')) {
            // Handle instance update (with or without variant removal)
            const compareReactionsNormalized = new Set(reactionsToCompare.map(normalizeReaction));

            // Separate current reactions into component-matching and instance-only
            const componentMatchingReactions: Reaction[] = [];
            const instanceOnlyReactions: Reaction[] = [];

            currentReactions.forEach(reaction => {
              const normalized = normalizeReaction(reaction);
              if (compareReactionsNormalized.has(normalized)) {
                componentMatchingReactions.push(reaction);
              } else {
                instanceOnlyReactions.push(reaction);
              }
            });

            if (updateSource === 'instance') {
              // Update instance reactions only - keep all component-matching reactions untouched
              if (triggerType) {
                reactionsToUpdate = instanceOnlyReactions.filter(reaction =>
                  reaction.trigger?.type === triggerType
                );
                reactionsToKeep = [
                  ...componentMatchingReactions, // Keep ALL component-matching reactions
                  ...instanceOnlyReactions.filter(reaction =>
                    reaction.trigger?.type !== triggerType
                  )
                ];
              } else {
                reactionsToUpdate = instanceOnlyReactions;
                reactionsToKeep = componentMatchingReactions; // Keep ALL component-matching reactions
              }
            } else if (updateSource === 'instance-remove-variant') {
              // Update instance reactions and remove component-matching reactions
              if (triggerType) {
                reactionsToUpdate = instanceOnlyReactions.filter(reaction =>
                  reaction.trigger?.type === triggerType
                );
                reactionsToKeep = instanceOnlyReactions.filter(reaction =>
                  reaction.trigger?.type !== triggerType
                );
                // Don't include componentMatchingReactions - they will be removed
              } else {
                reactionsToUpdate = instanceOnlyReactions;
                reactionsToKeep = []; // Remove all component-matching reactions
              }
            }
          } else if (updateSource === 'component' && node.type === 'INSTANCE' && reactionsToCompare.length > 0) {
            const compareReactionsNormalized = new Set(reactionsToCompare.map(normalizeReaction));

            // Separate current reactions into component-matching and instance-only
            const componentMatchingReactions: Reaction[] = [];
            const instanceOnlyReactions: Reaction[] = [];

            currentReactions.forEach(reaction => {
              const normalized = normalizeReaction(reaction);
              if (compareReactionsNormalized.has(normalized)) {
                componentMatchingReactions.push(reaction);
              } else {
                instanceOnlyReactions.push(reaction);
              }
            });

            if (updateSource === 'component') {
              // Update component reactions - filter by trigger type if specified
              if (triggerType) {
                reactionsToUpdate = componentMatchingReactions.filter(reaction =>
                  reaction.trigger?.type === triggerType
                );
                reactionsToKeep = [
                  ...componentMatchingReactions.filter(reaction =>
                    reaction.trigger?.type !== triggerType
                  ),
                  ...instanceOnlyReactions // Keep all instance reactions
                ];
              } else {
                reactionsToUpdate = componentMatchingReactions;
                reactionsToKeep = instanceOnlyReactions; // Keep all instance reactions
              }
            } else if (updateSource === 'instance') {
              // Update instance reactions only - keep all component-matching reactions untouched
              if (triggerType) {
                reactionsToUpdate = instanceOnlyReactions.filter(reaction =>
                  reaction.trigger?.type === triggerType
                );
                reactionsToKeep = [
                  ...componentMatchingReactions, // Keep ALL component-matching reactions
                  ...instanceOnlyReactions.filter(reaction =>
                    reaction.trigger?.type !== triggerType
                  )
                ];
              } else {
                reactionsToUpdate = instanceOnlyReactions;
                reactionsToKeep = componentMatchingReactions; // Keep ALL component-matching reactions
              }
            } else if (updateSource === 'instance-remove-variant') {
              // Update instance reactions and remove component-matching reactions
              if (triggerType) {
                reactionsToUpdate = instanceOnlyReactions.filter(reaction =>
                  reaction.trigger?.type === triggerType
                );
                reactionsToKeep = instanceOnlyReactions.filter(reaction =>
                  reaction.trigger?.type !== triggerType
                );
                // Don't include componentMatchingReactions - they will be removed
              } else {
                reactionsToUpdate = instanceOnlyReactions;
                reactionsToKeep = []; // Remove all component-matching reactions
              }
            }
          } else {
            // Normal update logic (no source filtering)
            if (triggerType) {
              reactionsToUpdate = currentReactions.filter(reaction =>
                reaction.trigger?.type === triggerType
              );
              reactionsToKeep = currentReactions.filter(reaction =>
                reaction.trigger?.type !== triggerType
              );
            } else {
              reactionsToUpdate = currentReactions;
              reactionsToKeep = [];
            }
          }

          // Skip this node if no reactions match the filter
          if (reactionsToUpdate.length === 0) {
            continue;
          }

          // Create updated reactions preserving destinations
          const trigger = createTrigger(nodeSettings.trigger, nodeSettings.delay);
          const bezierValues = nodeSettings.curve === 'CUSTOM_BEZIER' ? {
            x1: nodeSettings.bezierX1 || 0.25,
            y1: nodeSettings.bezierY1 || 0.1,
            x2: nodeSettings.bezierX2 || 0.25,
            y2: nodeSettings.bezierY2 || 1
          } : undefined;
          const springValues = (nodeSettings.curve === 'CUSTOM_SPRING' || ['GENTLE', 'QUICK', 'BOUNCY', 'SLOW'].includes(nodeSettings.curve)) ? {
            stiffness: nodeSettings.stiffness || 100,
            damping: nodeSettings.damping || 15,
            mass: nodeSettings.mass || 1
          } : undefined;
          const transition = createTransition(nodeSettings.animation, nodeSettings.duration, nodeSettings.curve, bezierValues, springValues);

          if (transition) {
            const updatedReactions = reactionsToUpdate.map(reaction => {
              const firstAction = getReactionAction(reaction);
              const preservedDestinationId = firstAction && isNodeAction(firstAction) ? firstAction.destinationId : null;
              const preservedNavigation = firstAction && isNodeAction(firstAction) ? firstAction.navigation : 'NAVIGATE';
              const preservedScrollPosition = firstAction && isNodeAction(firstAction) ? firstAction.preserveScrollPosition : false;

              return {
                actions: [{
                  type: 'NODE',
                  destinationId: preservedDestinationId,
                  navigation: preservedNavigation,
                  transition: transition,
                  preserveScrollPosition: preservedScrollPosition
                }],
                trigger: trigger
              } as Reaction;
            });

            // Use async method for dynamic-page access
            await nodeToUpdate.setReactionsAsync([...reactionsToKeep, ...updatedReactions]);
            interactionsUpdated += updatedReactions.length;
          }
        }
      }
    } else if (mode === 'add') {
      console.log('[PLUGIN] add-mode branch');
      let createdAny = false;
      // Determine available mapping sources
      const hasFromToIds = Array.isArray(fromList) && Array.isArray(toList) && fromList.length > 0 && toList.length > 0;
      const hasFromToVariants = Array.isArray(fromVariantFilter) && fromVariantFilter.length > 0 && Array.isArray(toVariantFilter) && toVariantFilter.length > 0;
      const usePropertyMapping = !!(propertyMappingConfig && (
        (propertyMappingConfig.pairingProperties && propertyMappingConfig.pairingProperties.length > 0) ||
        (propertyMappingConfig.substitutionProperties && Object.keys(propertyMappingConfig.substitutionProperties).length > 0)
      ));
      console.log('[PLUGIN] add-mode flags', { hasFromToIds, hasFromToVariants, usePropertyMapping });
      figma.ui.postMessage({
        type: 'debug',
        message: '[PLUGIN] add-mode flags',
        data: {
          hasFromToIds,
          hasFromToVariants,
          usePropertyMapping,
          supportedNodesCount: supportedNodes.length
        }
      });

      if (hasFromToIds) {
        console.log('[PLUGIN] Using From/To IDs');
        if (fromList.length !== toList.length) {
          figma.ui.postMessage({ type: 'error', message: 'From and To lists must have the same number of items.' });
          return false;
        }

        console.log('Creating add mode interactions using From/To mapping (IDs):');
        console.log('  From IDs:', fromList);
        console.log('  To IDs:', toList);
        const pairCount = fromList.length;
        let created = 0;
        for (let i = 0; i < pairCount; i++) {
          const fromId = fromList[i];
          const toId = toList[i];
          const fromNodeAny = await figma.getNodeByIdAsync(fromId) as SceneNode | null;
          const toNodeAny = await figma.getNodeByIdAsync(toId) as SceneNode | null;
          if (!fromNodeAny || !toNodeAny) {
            console.log(`  Skipping pair ${i + 1}: could not resolve nodes (from=${fromId}, to=${toId})`);
            continue;
          }
          if (fromNodeAny.id === toNodeAny.id) { console.log(`  Skipping pair ${i + 1}: identical From and To (${fromNodeAny.id})`); continue; }
          console.log(`  ${i + 1}. ${fromNodeAny.name} (id: ${fromId}) → ${toNodeAny.name} (id: ${toId})`);

          const sourceNode = getReactionTargetNode(fromNodeAny) || resolveInteractiveNode(fromNodeAny);
          if (!sourceNode) { console.log(`  Skipping pair ${i + 1}: source node not interactive`); continue; }

          const trigger = createTrigger(settings.trigger, settings.delay);
          const bezierValues = settings.curve === 'CUSTOM_BEZIER' ? {
            x1: settings.bezierX1 || 0.25,
            y1: settings.bezierY1 || 0.1,
            x2: settings.bezierX2 || 0.25,
            y2: settings.bezierY2 || 1
          } : undefined;
          const springValues = (settings.curve === 'CUSTOM_SPRING' || ['GENTLE', 'QUICK', 'BOUNCY', 'SLOW'].includes(settings.curve)) ? {
            stiffness: settings.stiffness || 100,
            damping: settings.damping || 15,
            mass: settings.mass || 1
          } : undefined;
          const transition = createTransition(settings.animation, settings.duration, settings.curve, bezierValues, springValues);
          if (!transition) { console.log(`  Skipping pair ${i + 1}: no transition created`); continue; }

          // Decide between CHANGE_TO (variants of same set) vs NAVIGATE (frames)
          // For instances, always use NAVIGATE instead of CHANGE_TO
          const sourceVariant = await getVariantComponentForChangeTo(fromNodeAny);
          const targetVariant = await getVariantComponentForChangeTo(toNodeAny);
          const canChangeTo = areSameComponentSet(sourceVariant, targetVariant) &&
            fromNodeAny.type !== 'INSTANCE' && toNodeAny.type !== 'INSTANCE';

          if (canChangeTo && targetVariant) {
            const newReaction: Reaction = {
              actions: [{
                type: 'NODE',
                destinationId: targetVariant.id,
                navigation: 'CHANGE_TO',
                transition: transition,
                preserveScrollPosition: false
              }],
              trigger: trigger
            };

            const currentReactions = sourceNode.reactions || [];
            await sourceNode.setReactionsAsync([...currentReactions, newReaction]);
            createdAny = true;
            created++;
            interactionsCreated++;
          } else {
            const targetResolved = resolveInteractiveNode(toNodeAny);
            const rawTarget = (targetResolved as unknown as SceneNode) || toNodeAny;
            const targetFrame = findNearestFrame(rawTarget);

            const destinationId = targetFrame ? targetFrame.id : rawTarget.id;
            if (destinationId) {
              const newReaction: Reaction = {
                actions: [{
                  type: 'NODE',
                  destinationId: destinationId,
                  navigation: 'NAVIGATE',
                  transition: transition,
                  preserveScrollPosition: false
                }],
                trigger: trigger
              };

              const currentReactions = sourceNode.reactions || [];
              await sourceNode.setReactionsAsync([...currentReactions, newReaction]);
              createdAny = true;
              created++;
            } else {
              console.log(`  Skipping pair ${i + 1}: could not resolve target destination`);
            }
          }
        }
        if (created === 0) {
          figma.ui.postMessage({ type: 'error', message: 'No valid From/To pairs to connect. Ensure From and To are different.' });
          return false;
        }
      } else if (hasFromToVariants) {
        console.log('[PLUGIN] Using From/To variant filters');
        // Continue with existing From/To variant logic (full implementation)
        const fromMap = parseVariantFiltersToMap(fromVariantFilter);
        const toMap = parseVariantFiltersToMap(toVariantFilter);
        const fromNodes = collectNodesByVariantMap(supportedNodes, fromMap);
        const toNodes = collectNodesByVariantMap(supportedNodes, toMap);

        // Build pairing props to keep Type/Size/Shape equal (and similar), allow differing props (e.g., State)
        const pairingProps = getPairingProperties(fromMap, toMap);
        console.log('  Pairing properties (must match):', pairingProps);

        // Index To nodes by pairing key
        const toIndex = new Map<string, SceneNode[]>();
        for (const n of toNodes) {
          const key = buildVariantKeyForNode(n, pairingProps);
          if (!toIndex.has(key)) toIndex.set(key, []);
          toIndex.get(key)!.push(n);
        }
        // Stable order
        for (const [k, arr] of toIndex.entries()) {
          toIndex.set(k, arr);
        }

        let createdV = 0;
        let pairIdx = 0;
        for (const fromNodeAny of fromNodes) {
          const key = buildVariantKeyForNode(fromNodeAny, pairingProps);
          const bucket = toIndex.get(key);
          if (!bucket || bucket.length === 0) { console.log(`  No To candidate for key ${key}`); continue; }
          // pick the first candidate whose id differs
          let toNodeAny: SceneNode | undefined = undefined;
          for (let j = 0; j < bucket.length; j++) {
            if (bucket[j].id !== fromNodeAny.id) { toNodeAny = bucket.splice(j, 1)[0]; break; }
          }
          if (!toNodeAny) { console.log(`  Skipping key ${key}: only identical node available`); continue; }
          pairIdx++;
          console.log(`  ${pairIdx}. ${fromNodeAny.name} → ${toNodeAny.name}`);

          const sourceNode = getReactionTargetNode(fromNodeAny) || resolveInteractiveNode(fromNodeAny);
          if (!sourceNode) { console.log(`  Skipping pair ${pairIdx}: source node not interactive`); continue; }

          const trigger = createTrigger(settings.trigger, settings.delay);
          const bezierValues = settings.curve === 'CUSTOM_BEZIER' ? {
            x1: settings.bezierX1 || 0.25,
            y1: settings.bezierY1 || 0.1,
            x2: settings.bezierX2 || 0.25,
            y2: settings.bezierY2 || 1
          } : undefined;
          const springValues = (settings.curve === 'CUSTOM_SPRING' || ['GENTLE', 'QUICK', 'BOUNCY', 'SLOW'].includes(settings.curve)) ? {
            stiffness: settings.stiffness || 100,
            damping: settings.damping || 15,
            mass: settings.mass || 1
          } : undefined;
          const transition = createTransition(settings.animation, settings.duration, settings.curve, bezierValues, springValues);
          if (!transition) { console.log(`  Skipping pair ${pairIdx}: no transition created`); continue; }

          // Decide between CHANGE_TO (variants of same set) vs NAVIGATE (frames)
          // For instances, always use NAVIGATE instead of CHANGE_TO
          const sourceVariant = await getVariantComponentForChangeTo(fromNodeAny);
          const targetVariant = await getVariantComponentForChangeTo(toNodeAny);
          const canChangeTo = areSameComponentSet(sourceVariant, targetVariant) &&
            fromNodeAny.type !== 'INSTANCE' && toNodeAny.type !== 'INSTANCE';

          if (canChangeTo && targetVariant) {
            const newReaction: Reaction = {
              actions: [{
                type: 'NODE',
                destinationId: targetVariant.id,
                navigation: 'CHANGE_TO',
                transition: transition,
                preserveScrollPosition: false
              }],
              trigger: trigger
            };

            const currentReactions = sourceNode.reactions || [];
            await sourceNode.setReactionsAsync([...currentReactions, newReaction]);
            createdAny = true;
            createdV++;
            interactionsCreated++;
          } else {
            const targetResolved = resolveInteractiveNode(toNodeAny);
            const rawTarget = (targetResolved as unknown as SceneNode) || toNodeAny;
            const targetFrame = findNearestFrame(rawTarget);

            const destinationId = targetFrame ? targetFrame.id : rawTarget.id;
            if (destinationId) {
              const newReaction: Reaction = {
                actions: [{
                  type: 'NODE',
                  destinationId: destinationId,
                  navigation: 'NAVIGATE',
                  transition: transition,
                  preserveScrollPosition: false
                }],
                trigger: trigger
              };

              const currentReactions = sourceNode.reactions || [];
              await sourceNode.setReactionsAsync([...currentReactions, newReaction]);
              createdAny = true;
              createdV++;
            } else {
              console.log(`  Skipping pair ${pairIdx}: could not resolve target destination`);
            }
          }
        }
        if (createdV === 0) {
          figma.ui.postMessage({ type: 'error', message: 'No valid From/To variant pairs to connect. Ensure From and To filters yield different targets.' });
          return false;
        }
      } else if (usePropertyMapping) {
        console.log('[PLUGIN] Using advanced property mapping');
        figma.ui.postMessage({ type: 'debug', message: '[PLUGIN] Using advanced property mapping', data: propertyMappingConfig });
        // Advanced property mapping mode
        console.log('Creating add mode interactions using advanced property mapping:');
        console.log('  Pairing properties (keep same):', propertyMappingConfig.pairingProperties);
        console.log('  Substitution properties:', propertyMappingConfig.substitutionProperties);

        // Build From and To variant filters from the property mapping configuration
        const fromVariantFilters: string[] = [];
        const toVariantFilters: string[] = [];

        // Add pairing properties (same value for both from and to)
        for (const property of propertyMappingConfig.pairingProperties) {
          // Collect all values of this property from selection to include all combinations
          const allValues = new Set<string>();
          supportedNodes.forEach(node => {
            const variantNode = node as NodeWithVariants;
            if (variantNode.variantProperties && variantNode.variantProperties[property]) {
              allValues.add(variantNode.variantProperties[property]);
            }
            // Handle component sets
            if (node.type === 'COMPONENT_SET') {
              const set = node as ComponentSetNode;
              set.children.forEach(child => {
                if (child.type === 'COMPONENT') {
                  const childVariant = child as NodeWithVariants;
                  if (childVariant.variantProperties && childVariant.variantProperties[property]) {
                    allValues.add(childVariant.variantProperties[property]);
                  }
                }
              });
            }
          });

          // Add all combinations to both from and to filters
          allValues.forEach(value => {
            fromVariantFilters.push(`${property}:${value}`);
            toVariantFilters.push(`${property}:${value}`);
          });
        }

        // Add substitution properties (different values for from and to)
        for (const [property, mapping] of Object.entries(propertyMappingConfig.substitutionProperties)) {
          if (mapping.from && mapping.to) {
            fromVariantFilters.push(`${property}:${mapping.from}`);
            toVariantFilters.push(`${property}:${mapping.to}`);
          }
        }

        if (fromVariantFilters.length === 0 || toVariantFilters.length === 0) {
          figma.ui.postMessage({ type: 'error', message: 'Property mapping configuration is incomplete. Please configure at least one property pairing or substitution.' });
          return false;
        }

        console.log('  Generated from filters:', fromVariantFilters);
        console.log('  Generated to filters:', toVariantFilters);
        figma.ui.postMessage({ type: 'debug', message: '[PLUGIN] Generated filters', data: { fromVariantFilters, toVariantFilters } });

        // Use the generated filters with existing logic
        const fromMap = parseVariantFiltersToMap(fromVariantFilters);
        const toMap = parseVariantFiltersToMap(toVariantFilters);
        const fromNodes = collectNodesByVariantMap(supportedNodes, fromMap);
        const toNodes = collectNodesByVariantMap(supportedNodes, toMap);

        console.log('  Matched From nodes:');
        fromNodes.forEach((n, idx) => {
          const variantNode = n as NodeWithVariants;
          const vp = variantNode.variantProperties ? JSON.stringify(variantNode.variantProperties) : 'none';
          console.log(`    ${idx + 1}. ${n.name} (id: ${n.id}) • variants=${vp}`);
        });
        console.log('  Matched To nodes:');
        toNodes.forEach((n, idx) => {
          const variantNode = n as NodeWithVariants;
          const vp = variantNode.variantProperties ? JSON.stringify(variantNode.variantProperties) : 'none';
          console.log(`    ${idx + 1}. ${n.name} (id: ${n.id}) • variants=${vp}`);
        });

        figma.ui.postMessage({ type: 'debug', message: '[PLUGIN] Matched nodes counts', data: { fromCount: fromNodes.length, toCount: toNodes.length } });
        if (fromNodes.length < 1 || toNodes.length < 1) {
          figma.ui.postMessage({ type: 'error', message: 'No nodes match the property mapping configuration.' });
          return false;
        }

        // Use the configured pairing properties instead of auto-detecting them
        const pairingProps = propertyMappingConfig.pairingProperties;
        console.log('  Using configured pairing properties:', pairingProps);

        // Index To nodes by pairing key
        const toIndex = new Map<string, SceneNode[]>();
        for (const n of toNodes) {
          const key = buildVariantKeyForNode(n, pairingProps);
          if (!toIndex.has(key)) toIndex.set(key, []);
          toIndex.get(key)!.push(n);
        }

        let createdPropertyMappings = 0;
        let pairIdx = 0;
        for (const fromNodeAny of fromNodes) {
          const key = buildVariantKeyForNode(fromNodeAny, pairingProps);
          const bucket = toIndex.get(key);
          if (!bucket || bucket.length === 0) {
            console.log(`  No To candidate for key ${key}`);
            continue;
          }

          // Pick the first candidate whose id differs
          let toNodeAny: SceneNode | undefined = undefined;
          for (let j = 0; j < bucket.length; j++) {
            if (bucket[j].id !== fromNodeAny.id) {
              toNodeAny = bucket.splice(j, 1)[0];
              break;
            }
          }
          if (!toNodeAny) {
            console.log(`  Skipping key ${key}: only identical node available`);
            continue;
          }

          pairIdx++;
          console.log(`  ${pairIdx}. ${fromNodeAny.name} → ${toNodeAny.name}`);

          const sourceNode = getReactionTargetNode(fromNodeAny) || resolveInteractiveNode(fromNodeAny);
          if (!sourceNode) {
            console.log(`  Skipping pair ${pairIdx}: source node not interactive`);
            continue;
          }

          const trigger = createTrigger(settings.trigger, settings.delay);
          const bezierValues = settings.curve === 'CUSTOM_BEZIER' ? {
            x1: settings.bezierX1 || 0.25,
            y1: settings.bezierY1 || 0.1,
            x2: settings.bezierX2 || 0.25,
            y2: settings.bezierY2 || 1
          } : undefined;
          const springValues = (settings.curve === 'CUSTOM_SPRING' || ['GENTLE', 'QUICK', 'BOUNCY', 'SLOW'].includes(settings.curve)) ? {
            stiffness: settings.stiffness || 100,
            damping: settings.damping || 15,
            mass: settings.mass || 1
          } : undefined;
          const transition = createTransition(settings.animation, settings.duration, settings.curve, bezierValues, springValues);
          if (!transition) {
            console.log(`  Skipping pair ${pairIdx}: no transition created`);
            continue;
          }

          // Decide between CHANGE_TO (variants of same set) vs NAVIGATE (frames)
          // For instances, always use NAVIGATE instead of CHANGE_TO
          const sourceVariant = await getVariantComponentForChangeTo(fromNodeAny);
          const targetVariant = await getVariantComponentForChangeTo(toNodeAny);
          const canChangeTo = areSameComponentSet(sourceVariant, targetVariant) &&
            fromNodeAny.type !== 'INSTANCE' && toNodeAny.type !== 'INSTANCE';

          if (canChangeTo && targetVariant) {
            const newReaction: Reaction = {
              actions: [{
                type: 'NODE',
                destinationId: targetVariant.id,
                navigation: 'CHANGE_TO',
                transition: transition,
                preserveScrollPosition: false
              }],
              trigger: trigger
            };

            const currentReactions = sourceNode.reactions || [];
            await sourceNode.setReactionsAsync([...currentReactions, newReaction]);
            createdAny = true;
            createdPropertyMappings++;
            interactionsCreated++;
          } else {
            const targetResolved = resolveInteractiveNode(toNodeAny);
            const rawTarget = (targetResolved as unknown as SceneNode) || toNodeAny;
            const targetFrame = findNearestFrame(rawTarget);

            const destinationId = targetFrame ? targetFrame.id : rawTarget.id;
            if (destinationId) {
              const newReaction: Reaction = {
                actions: [{
                  type: 'NODE',
                  destinationId: destinationId,
                  navigation: 'NAVIGATE',
                  transition: transition,
                  preserveScrollPosition: false
                }],
                trigger: trigger
              };

              const currentReactions = sourceNode.reactions || [];
              await sourceNode.setReactionsAsync([...currentReactions, newReaction]);
              createdAny = true;
              createdPropertyMappings++;
            } else {
              console.log(`  Skipping pair ${pairIdx}: could not resolve target destination`);
            }
          }
        }

        if (createdPropertyMappings === 0) {
          figma.ui.postMessage({ type: 'error', message: 'No valid property mapping pairs could be created. Check your pairing and substitution configuration.' });
          return false;
        }
      } else {
        // Check if we have position configuration for By Position mode
        if (positionConfig) {
          console.log('[PLUGIN] Using position-based interaction creation');
          supportedNodes = sortNodesByPosition(supportedNodes, positionConfig.direction);

          console.log('Creating add mode interactions by position with direction:', positionConfig.direction, 'group size:', positionConfig.everyN);
          const pairs = createPositionPairs(supportedNodes, positionConfig.everyN, positionConfig.direction, positionConfig.skip || 0);
          for (const pair of pairs) {
            console.log(`  ${pair.from.name} (id: ${pair.from.id}) → ${pair.to.name} (id: ${pair.to.id})`);
          }
        } else {
          console.log('[PLUGIN] Using selection-order chaining');
          console.log('[PLUGIN] orderMode:', orderMode, 'orderReverse:', orderReverse);
          // Apply By Order options: layer list ordering and reverse
          if (orderMode === 'layer') {
            const getIndexPath = (node: SceneNode): number[] => {
              const path: number[] = [];
              let current: SceneNode | PageNode | null = node as SceneNode;
              // Walk up until Page
              while (current && (current as SceneNode).parent) {
                const parent = (current as SceneNode).parent as BaseNode & { children?: readonly SceneNode[] };
                if (parent && 'children' in parent && Array.isArray((parent as any).children)) {
                  const idx = (parent as any).children.indexOf(current as SceneNode);
                  path.push(idx);
                  current = parent as unknown as SceneNode;
                } else {
                  break;
                }
              }
              // Compare from root to leaf, so reverse collected path
              return path.reverse();
            };
            supportedNodes = [...supportedNodes].sort((a, b) => {
              const pa = getIndexPath(a);
              const pb = getIndexPath(b);
              const len = Math.max(pa.length, pb.length);
              for (let i = 0; i < len; i++) {
                const va = pa[i] ?? -1;
                const vb = pb[i] ?? -1;
                if (va !== vb) return va - vb;
              }
              return 0;
            });
          }
          if (orderReverse) {
            supportedNodes = [...supportedNodes].reverse();
          }
          // Default: selection-order chaining requires at least 2
          if (supportedNodes.length < 2) {
            console.warn('[PLUGIN] Not enough layers for selection-order chaining (this path).');
          }

          console.log('Creating add mode interactions in this order:');
          for (let i = 0; i < supportedNodes.length - 1; i++) {
            console.log(`  ${i + 1}. ${supportedNodes[i].name} (id: ${supportedNodes[i].id}) → ${supportedNodes[i + 1].name} (id: ${supportedNodes[i + 1].id})`);
          }
        }
        console.log('=== END INTERACTION CREATION DEBUG ===');

        // Handle position-based pairs if using position config
        if (positionConfig) {
          const pairs = createPositionPairs(supportedNodes, positionConfig.everyN, positionConfig.direction, positionConfig.skip || 0);

          for (const pair of pairs) {
            const sourceNode = getReactionTargetNode(pair.from) || resolveInteractiveNode(pair.from);
            if (!sourceNode || !supportsInteractions(sourceNode)) {
              console.log('[PLUGIN] Skipping position pair: source node does not support interactions');
              continue;
            }

            const trigger = createTrigger(settings.trigger, settings.delay);
            const bezierValues = settings.curve === 'CUSTOM_BEZIER' ? {
              x1: settings.bezierX1 || 0.25,
              y1: settings.bezierY1 || 0.1,
              x2: settings.bezierX2 || 0.25,
              y2: settings.bezierY2 || 1
            } : undefined;
            const springValues = (settings.curve === 'CUSTOM_SPRING' || ['GENTLE', 'QUICK', 'BOUNCY', 'SLOW'].includes(settings.curve)) ? {
              stiffness: settings.stiffness || 100,
              damping: settings.damping || 15,
              mass: settings.mass || 1
            } : undefined;
            const transition = createTransition(settings.animation, settings.duration, settings.curve, bezierValues, springValues);
            if (!transition) {
              console.log('[PLUGIN] Skipping position pair: no transition created');
              continue;
            }

            // Decide between CHANGE_TO (variants of same set) vs NAVIGATE (frames)
            // For instances, always use NAVIGATE instead of CHANGE_TO
            const sourceVariant = await getVariantComponentForChangeTo(pair.from);
            const targetVariant = await getVariantComponentForChangeTo(pair.to);
            const canChangeTo = areSameComponentSet(sourceVariant, targetVariant) &&
              pair.from.type !== 'INSTANCE' && pair.to.type !== 'INSTANCE';

            if (canChangeTo && targetVariant) {
              const newReaction: Reaction = {
                actions: [{
                  type: 'NODE',
                  destinationId: targetVariant.id,
                  navigation: 'CHANGE_TO',
                  transition: transition,
                  preserveScrollPosition: false
                }],
                trigger: trigger
              };
              const currentReactions = sourceNode.reactions || [];
              await sourceNode.setReactionsAsync([...currentReactions, newReaction]);
              createdAny = true;
              interactionsCreated++;
            } else {
              const targetResolved = resolveInteractiveNode(pair.to);
              const rawTarget = (targetResolved as unknown as SceneNode) || pair.to;
              const targetFrame = findNearestFrame(rawTarget);
              const destinationId = targetFrame ? targetFrame.id : rawTarget.id;
              if (destinationId) {
                const newReaction: Reaction = {
                  actions: [{
                    type: 'NODE',
                    destinationId: destinationId,
                    navigation: 'NAVIGATE',
                    transition: transition,
                    preserveScrollPosition: false
                  }],
                  trigger: trigger
                };
                const currentReactions = sourceNode.reactions || [];
                await sourceNode.setReactionsAsync([...currentReactions, newReaction]);
                createdAny = true;
                interactionsCreated++;
              } else {
                console.log('[PLUGIN] Skipping position pair: could not resolve target destination for', pair.to.name);
              }
            }
          }
        } else {
          // Original selection-order logic with step incremental support
          // Sort nodes for step incremental if needed
          supportedNodes = sortNodesForStepIncremental(supportedNodes, stepIncremental);

          for (let i = 0; i < supportedNodes.length - 1; i++) {
            const sourceNode = getReactionTargetNode(supportedNodes[i]) || resolveInteractiveNode(supportedNodes[i]);

            if (!sourceNode) continue;

            // Apply step incremental values to settings for this node
            const nodeSettings = applyStepIncrementalToSettings(settings, i, stepIncremental);

            const trigger = createTrigger(nodeSettings.trigger, nodeSettings.delay);
            const bezierValues = nodeSettings.curve === 'CUSTOM_BEZIER' ? {
              x1: nodeSettings.bezierX1 || 0.25,
              y1: nodeSettings.bezierY1 || 0.1,
              x2: nodeSettings.bezierX2 || 0.25,
              y2: nodeSettings.bezierY2 || 1
            } : undefined;
            const springValues = (nodeSettings.curve === 'CUSTOM_SPRING' || ['GENTLE', 'QUICK', 'BOUNCY', 'SLOW'].includes(nodeSettings.curve)) ? {
              stiffness: nodeSettings.stiffness || 100,
              damping: nodeSettings.damping || 15,
              mass: nodeSettings.mass || 1
            } : undefined;
            const transition = createTransition(nodeSettings.animation, nodeSettings.duration, nodeSettings.curve, bezierValues, springValues);

            if (!transition) continue;

            // Decide between CHANGE_TO (variants of same set) vs NAVIGATE (frames)
            // For instances, always use NAVIGATE instead of CHANGE_TO
            const sourceVariant = await getVariantComponentForChangeTo(supportedNodes[i]);
            const targetVariant = await getVariantComponentForChangeTo(supportedNodes[i + 1]);
            const canChangeTo = areSameComponentSet(sourceVariant, targetVariant) &&
              supportedNodes[i].type !== 'INSTANCE' && supportedNodes[i + 1].type !== 'INSTANCE';

            if (canChangeTo && targetVariant) {
              const newReaction: Reaction = {
                actions: [{
                  type: 'NODE',
                  destinationId: targetVariant.id,
                  navigation: 'CHANGE_TO',
                  transition: transition,
                  preserveScrollPosition: false
                }],
                trigger: trigger
              };

              const currentReactions = sourceNode.reactions || [];
              await sourceNode.setReactionsAsync([...currentReactions, newReaction]);
              createdAny = true;
              interactionsCreated++;
            } else {
              // Only create NAVIGATE when a valid Frame destination can be resolved
              const targetResolved = resolveInteractiveNode(supportedNodes[i + 1]);
              const rawTarget = (targetResolved as unknown as SceneNode) || supportedNodes[i + 1];
              const targetFrame = findNearestFrame(rawTarget);

              const destinationId = targetFrame ? targetFrame.id : rawTarget.id;
              if (destinationId) {
                const newReaction: Reaction = {
                  actions: [{
                    type: 'NODE',
                    destinationId: destinationId,
                    navigation: 'NAVIGATE',
                    transition: transition,
                    preserveScrollPosition: false
                  }],
                  trigger: trigger
                };

                const currentReactions = sourceNode.reactions || [];
                await sourceNode.setReactionsAsync([...currentReactions, newReaction]);
                createdAny = true;
                interactionsCreated++;
              } else {
                console.log('[PLUGIN] Skipping NAVIGATE creation: could not resolve target destination for', supportedNodes[i + 1].name);
              }
            }
          }
        }

        // If nothing was created in add mode, report an error instead of success
        if (!createdAny) {
          figma.ui.postMessage({
            type: 'error',
            message: 'No interactions were created. Ensure your destination is a Frame or a Component Instance placed on the canvas, or use From/To mapping or By Position.'
          });
          console.warn('[PLUGIN] No interactions created in add mode.');
          return false;
        }
      }
    }

    // Generate detailed success message
    let successMessage = '';
    if (mode === 'update') {
      successMessage = interactionsUpdated > 0
        ? `Updated ${interactionsUpdated} interaction${interactionsUpdated !== 1 ? 's' : ''} successfully!`
        : 'No interactions were updated.';
    } else if (mode === 'add') {
      successMessage = interactionsCreated > 0
        ? `Created ${interactionsCreated} interaction${interactionsCreated !== 1 ? 's' : ''} successfully!`
        : 'No interactions were created.';
    } else {
      successMessage = 'Interactions applied successfully!';
    }

    figma.ui.postMessage({ type: 'success', message: successMessage });
    console.log('[PLUGIN] applyInteractions done: success', { interactionsCreated, interactionsUpdated });
    await sendLayersToUI(); // Refresh the UI
    return true;

  } catch (error) {
    console.error('[PLUGIN] applyInteractions error', error);
    figma.ui.postMessage({ type: 'error', message: `Failed to apply interactions: ${error}` });
    return false;
  }
}

// Handle messages from UI
figma.ui.onmessage = async (msg: PluginMessage) => {
  switch (msg.type) {
    case 'get-selection':
      await sendLayersToUI();
      break;

    case 'focus-node':
      if (msg.nodeId) {
        const node = await figma.getNodeByIdAsync(msg.nodeId) as SceneNode;
        if (node) {
          // Store original stroke properties if the node supports them
          let originalStrokeProps: any = null;
          if ('strokes' in node && 'strokeWeight' in node && 'strokeAlign' in node) {
            const strokeNode = node as any;
            originalStrokeProps = {
              strokes: [...strokeNode.strokes],
              strokeWeight: strokeNode.strokeWeight,
              strokeAlign: strokeNode.strokeAlign,
              dashPattern: strokeNode.dashPattern ? [...strokeNode.dashPattern] : undefined,
              cornerRadius: strokeNode.cornerRadius
            };
          }

          // Add dotted red outline to highlight the focused node
          if ('strokes' in node && 'strokeWeight' in node && 'strokeAlign' in node) {
            const strokeNode = node as any;
            const redStroke = {
              type: 'SOLID',
              color: { r: 1, g: 0, b: 0 }, // Red color
              opacity: 1
            };
            strokeNode.strokes = [redStroke];
            strokeNode.strokeWeight = 6;
            strokeNode.strokeAlign = 'OUTSIDE';
            strokeNode.dashPattern = [8, 8]; // 8px dash, 8px gap for dotted pattern

            // Use the node's existing cornerRadius (don't override it)
            // cornerRadius is preserved from the original state
          }

          // Focus and zoom to the node with animation
          await figma.viewport.scrollAndZoomIntoView([node]);

          // Add blinking effect for 0.5 seconds
          let blinkCount = 0;
          const blinkInterval = setInterval(() => {
            if (blinkCount >= 4) { // 2 blinks over 0.5 seconds (125ms on/off)
              clearInterval(blinkInterval);

              // Remove the red outline after blinking
              if (originalStrokeProps && 'strokes' in node && 'strokeWeight' in node && 'strokeAlign' in node) {
                const strokeNode = node as any;
                strokeNode.strokes = originalStrokeProps.strokes;
                strokeNode.strokeWeight = originalStrokeProps.strokeWeight;
                strokeNode.strokeAlign = originalStrokeProps.strokeAlign;
                strokeNode.dashPattern = originalStrokeProps.dashPattern;
                strokeNode.cornerRadius = originalStrokeProps.cornerRadius;
              }
              return;
            }

            if ('strokes' in node) {
              const strokeNode = node as any;
              if (blinkCount % 2 === 0) {
                // Show outline (even counts)
                const redStroke = {
                  type: 'SOLID',
                  color: { r: 1, g: 0, b: 0 },
                  opacity: 1
                };
                strokeNode.strokes = [redStroke];
                strokeNode.strokeWeight = 6;
                strokeNode.strokeAlign = 'OUTSIDE';
                strokeNode.dashPattern = [8, 8];
                // cornerRadius is preserved from the original state
              } else {
                // Hide outline (odd counts)
                strokeNode.strokes = [];
              }
            }

            blinkCount++;
          }, 125); // Blink every 125ms
        }
      }
      break;

    case 'highlight-trigger-nodes':
      if (msg.triggerType && msg.nodeIds) {
        const nodesToHighlight = [];
        const originalStates = new Map();

        // Get all nodes and store their original states
        for (const nodeId of msg.nodeIds) {
          const node = await figma.getNodeByIdAsync(nodeId) as SceneNode;
          if (node && 'strokes' in node && 'strokeWeight' in node && 'strokeAlign' in node) {
            const strokeNode = node as any;
            originalStates.set(nodeId, {
              strokes: [...strokeNode.strokes],
              strokeWeight: strokeNode.strokeWeight,
              strokeAlign: strokeNode.strokeAlign,
              dashPattern: strokeNode.dashPattern ? [...strokeNode.dashPattern] : undefined,
              cornerRadius: strokeNode.cornerRadius
            });

            // Apply blue outline to nodes with this trigger type
            const blueStroke = {
              type: 'SOLID',
              color: { r: 0, g: 0.5, b: 1 }, // Blue color
              opacity: 1
            };
            strokeNode.strokes = [blueStroke];
            strokeNode.strokeWeight = 4;
            strokeNode.strokeAlign = 'OUTSIDE';
            strokeNode.dashPattern = [6, 6]; // Different pattern for trigger highlighting
            // cornerRadius is preserved from the original state

            nodesToHighlight.push(node);
          }
        }

        // Auto zoom to show all highlighted nodes
        if (nodesToHighlight.length > 0) {
          figma.viewport.scrollAndZoomIntoView(nodesToHighlight);
        }

        // Store for cleanup
        if (nodesToHighlight.length > 0 && msg.nodeIds) {
          const nodeIdsToClean = [...msg.nodeIds]; // Store a copy to avoid TypeScript issues

          // Add blinking effect for 0.5 seconds
          let blinkCount = 0;
          const blinkInterval = setInterval(async () => {
            if (blinkCount >= 4) { // 2 blinks over 0.5 seconds (125ms on/off)
              clearInterval(blinkInterval);

              // Remove highlights after blinking
              for (const nodeId of nodeIdsToClean) {
                const node = await figma.getNodeByIdAsync(nodeId) as SceneNode;
                if (node && 'strokes' in node && 'strokeWeight' in node && 'strokeAlign' in node) {
                  const strokeNode = node as any;
                  const originalState = originalStates.get(nodeId);
                  if (originalState) {
                    strokeNode.strokes = originalState.strokes;
                    strokeNode.strokeWeight = originalState.strokeWeight;
                    strokeNode.strokeAlign = originalState.strokeAlign;
                    strokeNode.dashPattern = originalState.dashPattern;
                    strokeNode.cornerRadius = originalState.cornerRadius;
                  }
                }
              }
              return;
            }

            // Toggle outline visibility for blinking effect
            const shouldShowOutline = blinkCount % 2 === 0;
            for (const nodeId of nodeIdsToClean) {
              const node = await figma.getNodeByIdAsync(nodeId) as SceneNode;
              if (node && 'strokes' in node) {
                const strokeNode = node as any;
                if (shouldShowOutline) {
                  // Show blue outline
                  const blueStroke = {
                    type: 'SOLID',
                    color: { r: 0, g: 0.5, b: 1 }, // Blue color
                    opacity: 1
                  };
                  strokeNode.strokes = [blueStroke];
                  strokeNode.strokeWeight = 4;
                  strokeNode.strokeAlign = 'OUTSIDE';
                  strokeNode.dashPattern = [6, 6];
                  // cornerRadius is preserved from the original state
                } else {
                  // Hide outline
                  strokeNode.strokes = [];
                }
              }
            }

            blinkCount++;
          }, 125); // Blink every 125ms
        }
      }
      break;

    case 'apply-interactions':
      if (msg.mode && msg.settings) {
        await applyInteractions(
          msg.mode,
          msg.settings,
          msg.triggerType,
          msg.nodeFilter,
          msg.variantFilter,
          msg.fromList,
          msg.toList,
          msg.fromVariantFilter,
          msg.toVariantFilter,
          msg.propertyMappingConfig,
          msg.positionConfig,
          msg.stepIncremental,
          msg.orderMode,
          msg.orderReverse,
          msg.updateSource
        );
      }
      break;

    case 'apply-saved-interaction':
      if (msg.settings && msg.applicationMode && msg.targetLayerIds) {
        await applySavedInteraction(
          msg.settings,
          msg.applicationMode,
          msg.targetLayerIds,
          msg.savedInteractionData
        );
      }
      break;

    case 'save-interaction-info':
      if (msg.layerId && msg.savedId && msg.interaction && msg.layerName) {
        await saveInteractionInfo(
          msg.layerId,
          msg.savedId,
          msg.interaction,
          msg.layerName
        );
      }
      break;

    case 'delete-saved-interaction':
      if (msg.savedId) {
        try {
          const existingData = await figma.clientStorage.getAsync('savedInteractions') || [];
          const savedInteractionsMap = new Map(existingData);
          savedInteractionsMap.delete(msg.savedId);
          await figma.clientStorage.setAsync('savedInteractions', Array.from(savedInteractionsMap.entries()));
        } catch (storageError) {
          console.error('[PLUGIN] Error deleting from client storage:', storageError);
        }
      }
      break;

    case 'remove-interactions': {
      // Use raw selection so Sections/Frames are included
      const nodes = figma.currentPage.selection as SceneNode[];
      if (nodes.length === 0) {
        figma.ui.postMessage({ type: 'error', message: 'Please select at least one supported layer.' });
        break;
      }
      let cleared = 0;
      const visited = new Set<string>();
      for (const node of nodes) {
        const targets = collectInteractiveNodesForRemoval(node);
        for (const t of targets) {
          if (!visited.has(t.id)) {
            await t.setReactionsAsync([]);
            visited.add(t.id);
            cleared++;
          }
        }
      }
      if (cleared > 0) {
        figma.ui.postMessage({ type: 'success', message: `Removed interactions from ${cleared} nodes.` });
      } else {
        figma.ui.postMessage({ type: 'error', message: 'No interactions to remove on the selected layers.' });
      }
      await sendLayersToUI();
      break;
    }

    case 'clean-invalid-interactions': {
      // Use raw selection so Sections/Frames are included
      const nodes = figma.currentPage.selection as SceneNode[];
      if (nodes.length === 0) {
        figma.ui.postMessage({ type: 'error', message: 'Please select at least one supported layer.' });
        break;
      }
      let totalRemoved = 0;
      const visited = new Set<string>();

      for (const node of nodes) {
        const targets = collectInteractiveNodesForRemoval(node);
        for (const targetNode of targets) {
          if (visited.has(targetNode.id)) continue;
          visited.add(targetNode.id);

          if (!targetNode.reactions || targetNode.reactions.length === 0) continue;

          // Filter out invalid reactions
          const validReactions = [];
          let removedCount = 0;

          for (const reaction of targetNode.reactions) {
            const firstAction = getReactionAction(reaction);
            const targetId = firstAction && isNodeAction(firstAction) ? firstAction.destinationId : null;
            const actionType = firstAction?.type || null;

            console.log(`Checking reaction on "${targetNode.name}": targetId=${targetId}, actionType=${actionType}`);

            // Check if reaction is invalid
            let isInvalid = false;
            let invalidReason = '';

            if (targetId) {
              try {
                const targetDestination = await figma.getNodeByIdAsync(targetId) as SceneNode;
                console.log(`Target destination for ${targetId}: ${targetDestination ? `"${targetDestination.name}" (id: ${targetDestination.id})` : 'null'}`);

                // Check if target is the same node (self-targeted)
                if (!targetDestination) {
                  isInvalid = true;
                  invalidReason = 'target does not exist';
                } else if (targetDestination.id === targetNode.id) {
                  isInvalid = true;
                  invalidReason = 'self-targeted';
                }
              } catch (error) {
                // Destination doesn't exist or can't be accessed
                isInvalid = true;
                invalidReason = `error accessing target: ${error}`;
                console.log(`Error accessing target ${targetId}:`, error);
              }
            } else if (actionType === 'NODE') {
              // NODE action type but no targetId - this is invalid
              isInvalid = true;
              invalidReason = 'NODE action type with no target';
              console.log(`Found invalid NODE action with no target on "${targetNode.name}"`);
            } else {
              console.log(`No targetId found for reaction on "${targetNode.name}" with actionType: ${actionType}`);
            }

            if (isInvalid) {
              console.log(`Removing invalid reaction: ${invalidReason}`);
              removedCount++;
            } else {
              validReactions.push(reaction);
            }
          }

          // Update reactions if any were removed
          if (removedCount > 0) {
            await targetNode.setReactionsAsync(validReactions);
            totalRemoved += removedCount;
          }
        }
      }

      if (totalRemoved > 0) {
        figma.ui.postMessage({ type: 'success', message: `Removed ${totalRemoved} invalid interaction(s).` });
      } else {
        figma.ui.postMessage({ type: 'info', message: 'No invalid interactions found.' });
      }

      await sendLayersToUI();
      break;
    }

    case 'resize-ui': {
      const width = Math.max(320, Math.min(1200, Number(msg.width) || 480));
      const height = Math.max(360, Math.min(1200, Number(msg.height) || 600));
      figma.ui.resize(width, height);
      break;
    }

    case 'save-user-curves': {
      await figma.clientStorage.setAsync('aic-user-curves-v1', msg.data);
      break;
    }

    case 'load-user-curves': {
      const data = await figma.clientStorage.getAsync('aic-user-curves-v1');
      figma.ui.postMessage({ type: 'user-curves-loaded', data: data || { userBezierCurves: [], userSpringCurves: [] } });
      break;
    }

    case 'close':
      figma.closePlugin();
      break;

    default:
      break;
  }
};

// Listen for selection changes
figma.on('selectionchange', async () => {
  // Update persisted ordering: keep existing order for still-selected nodes, append newly added
  const currentIds = figma.currentPage.selection.filter(supportsInteractions).map((n) => n.id);
  const stillSelected = orderedSelectionIds.filter((id) => currentIds.includes(id));
  const newlyAdded = currentIds.filter((id) => !stillSelected.includes(id));
  orderedSelectionIds = [...stillSelected, ...newlyAdded];
  await sendLayersToUI();
});

// Initialize
(async () => {
  await sendLayersToUI();
  await loadSavedInteractions();
})();
