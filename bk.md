# Automated Interaction Creator - Figma Plugin

A Figma plugin that automates the creation of ordered interactions between selected nodes, with special support for component variants and comprehensive interaction settings.

## Features

### 🎯 **Smart Node Support**
- **Frames**: Apply interactions to any frame
- **Components**: Support for standalone components and between component variants
- **Instances**: Apply interactions to component instances
- **Shapes**: Support for rectangles, ellipses, polygons, stars, lines, vectors, and text

### 🔄 **Component Variant Support**
- Works directly with individual component variants as selected
- Supports interactions between different variants within the same component set
- Maintains the specific variant identity for precise prototyping control
- Handles component sets through their default variant when selected

### ⚡ **Interaction Types**

#### Triggers
- **On Click**: Standard click interaction
- **On Drag**: Drag-based interaction
- **While Hovering**: Hover state interaction
- **While Pressing**: Press and hold interaction
- **After Delay**: Time-based automatic interaction (1 second default)

#### Animations
- **Instant**: No transition animation
- **Dissolve**: Fade transition between nodes
- **Smart Animate**: Figma's intelligent animation between similar elements
- **Move In**: Slide transition from the left

#### Easing Curves
- Linear, Ease In, Ease Out, Ease In and Out
- Ease In Back, Ease Out Back, Ease In and Out Back
- Custom duration control (in milliseconds)

### 💾 **Persistent Settings**
- Automatically saves interaction settings to plugin data
- Loads existing settings when selecting nodes with interactions
- Maintains settings across Figma sessions

## Core Functions

### `supportsInteractions(node: SceneNode): boolean`
Determines if a node type supports prototyping interactions.

**Supported Types:**
- Frame, Component Set, Component, Instance
- Rectangle, Ellipse, Polygon, Star, Line, Text, Vector

### `getNodeInteractions(node: SceneNode): InteractionSettings | null`
Reads existing interaction settings from a node, with handling of:
- Component sets (reads from default variant)
- Component variants (reads from the specific variant)
- Direct node reactions

### `applyInteractionToNode(nodes: SceneNode[], settings: InteractionSettings): Promise<boolean>`
Main function that creates ordered interactions between selected nodes.

**Process:**
1. Maps all nodes to their appropriate reaction targets
2. Handles component variant complexity automatically
3. Deduplicates nodes to prevent conflicts
4. Creates and applies reactions in sequence
5. Provides detailed error feedback

### `getReactionTargetNode(node: SceneNode): NodeWithReactions | null`
Helper function that determines the correct node for setting reactions:
- **Component Set** → Default Variant
- **Component Variant** → Direct component variant (as selected)
- **Other Nodes** → Direct node (if supported)

### `createTransition(animation: string, duration: number, easing: string): Transition | null`
Creates Figma-compatible transition objects with:
- Input validation and sanitization
- Proper type casting for API compatibility
- Fallback handling for unsupported options

### `createTrigger(triggerType: string): Trigger`
Generates trigger objects with safe fallbacks and proper API formatting.

### `loadSettingsForSelection()`
Automatically loads and displays interaction settings for the current selection:
- Checks for existing reactions
- Falls back to stored plugin data
- Updates UI state based on selection validity

## Usage

### Basic Workflow
1. **Select Nodes**: Choose 2 or more nodes that support interactions
2. **Configure Settings**: Use the UI to set trigger, animation, easing, and duration
3. **Apply**: Click "Apply Interaction" to create ordered interactions

### Advanced Usage
- **Component Variants**: Select individual variants - interactions are applied directly to each variant
- **Mixed Selections**: Combine different node types - the plugin filters and processes appropriately
- **Settings Persistence**: Previously configured interactions are automatically loaded when re-selecting nodes

### Error Handling
The plugin provides clear feedback for:
- Insufficient node selection (< 2 nodes)
- Unsupported node types
- Component sets without default variants
- API errors during interaction creation

## Technical Implementation

### TypeScript Architecture
- **Type Safety**: Comprehensive TypeScript definitions for all Figma API interactions
- **Error Resilience**: Robust error handling and validation throughout
- **API Compatibility**: Safe type casting and validation for Figma API requirements

### UI Integration
- **Real-time Updates**: UI automatically reflects current selection state
- **Dark Theme**: Modern interface matching Figma's design system
- **Responsive Controls**: Dynamic enabling/disabling based on selection validity

### Data Persistence
- **Plugin Data Storage**: Settings stored using Figma's plugin data API
- **Smart Target Selection**: Settings stored on appropriate nodes (default variants for component systems)
- **Cross-session Persistence**: Settings maintained across Figma sessions



### Plugin Structure
- `code.ts`: Main plugin logic with TypeScript
- `ui.html`: User interface with embedded JavaScript
- `manifest.json`: Plugin configuration
- `code.js`: Compiled JavaScript (generated)

## API Requirements
- Figma Plugin API 1.0.0
- Document access: dynamic-page
- No network access required
- Compatible with Figma editor environment

---

*This plugin simplifies the creation of complex interaction flows in Figma prototypes while handling the nuances of component variants and ensuring robust API compatibility.*
