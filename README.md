# Automated Interaction Creator - Figma Plugin

A powerful Figma plugin that automates the creation and management of interactions between selected layers with two distinct modes for different workflows.

## Features

### 🔄 **Two Operation Modes**

#### 1. **Update Mode** (Default)
- Updates existing interactions on selected layers
- Shows all selected layers with their current interactions
- Allows selective updating of specific trigger types when multiple exist
- Apply new interaction properties to all selected layers in one click

#### 2. **Add Mode**
- Creates new interactions between selected layers in selection order
- Each layer will transition to the next layer in the selection sequence
- Perfect for creating step-by-step flows and guided experiences
- Requires at least 2 selected layers

### 🎯 **Comprehensive Layer Support**
- **Frames**: Standard frame elements
- **Components & Instances**: Component variants and instances
- **Shapes**: Rectangles, ellipses, polygons, stars, lines, vectors
- **Text**: Text layers
- **Component Sets**: Automatic handling through default variants

### ⚡ **Rich Interaction Options**

#### **Trigger Types**
- **On Click**: Standard click interaction
- **On Drag**: Drag-based interaction  
- **While Hovering**: Hover state interaction
- **While Pressing**: Press and hold interaction
- **After Delay**: Time-based automatic interaction

#### **Animation Types**
- **Smart Animate**: Intelligent animation between similar elements
- **Dissolve**: Fade transition
- **Move In/Out**: Slide transitions
- **Push**: Push transition effect
- **Slide In/Out**: Slide transitions with different behaviors

#### **Easing Curves**
- Linear, Ease In, Ease Out, Ease In and Out
- Ease In Back, Ease Out Back, Ease In and Out Back
- Custom duration control (in milliseconds)

#### **Advanced Settings**
- **Delay**: Configurable delay in milliseconds
- **Stiffness**: Spring animation stiffness (1-1000)
- **Damping**: Spring animation damping (1-100)
- **Mass**: Spring animation mass (0.1-10)
- **Duration**: Animation duration in milliseconds

## How to Use

### Installation & Setup

1. **Build the Plugin**
   ```bash
   npm install
   npm run build
   ```

2. **Load in Figma**
   - Open Figma Desktop App
   - Go to `Plugins` → `Development` → `Import plugin from manifest...`
   - Select the `manifest.json` file from this directory
   - The plugin will appear in your plugins list

### Basic Workflow

#### **Update Mode** (Modify Existing Interactions)

1. **Select Layers**: Choose one or more layers that already have interactions
2. **Choose Mode**: Ensure "Update Mode" is selected (default)
3. **Select Trigger Type**: If multiple trigger types exist, choose which one to update (optional)
4. **Configure Settings**: Adjust interaction properties:
   - Trigger type
   - Delay
   - Animation type
   - Easing curve
   - Advanced spring settings
   - Duration
5. **Apply**: Click "Update Interactions" to apply changes to all selected layers

#### **Add Mode** (Create New Interactions)

1. **Select Layers**: Choose 2 or more layers in the order you want interactions to flow
2. **Switch Mode**: Click "Add Mode" tab
3. **Configure Settings**: Set up the interaction properties for the new connections
4. **Apply**: Click "Add Interactions" to create sequential interactions between selected layers

### Advanced Features

#### **Smart Trigger Selection**
- In Update Mode, when layers have multiple trigger types, a dropdown appears
- Choose "All Trigger Types" to replace all interactions
- Select specific trigger type to update only those interactions

#### **Real-time Selection Updates**
- The left panel automatically updates when you change your selection
- Current interactions are displayed for each layer
- Layer information shows: `Trigger • Delay • Animation • Curve • Duration`

#### **Intelligent Error Handling**
- Clear feedback for insufficient layer selection
- Validation for unsupported layer types
- Comprehensive error messages for troubleshooting

## UI Overview

### **Left Panel: Selected Layers**
- Displays all currently selected layers that support interactions
- Shows existing interaction details for each layer
- Mode selector to switch between Update and Add modes
- Real-time updates based on current selection

### **Right Panel: Interaction Settings**
- **Trigger**: Choose interaction trigger type
- **Delay**: Set delay in milliseconds
- **Animation**: Select transition animation type
- **Curve**: Choose easing curve
- **Advanced Settings**: 
  - Stiffness, Damping, Mass (for spring animations)
  - Duration (animation length)
- **Apply Button**: Execute the interaction changes

## Technical Details

### **Supported Layer Types**
- Frame, Component Set, Component, Instance
- Rectangle, Ellipse, Polygon, Star, Line, Text, Vector

### **API Compatibility**
- Built for Figma Plugin API 1.0.0
- TypeScript implementation with full type safety
- Handles Figma API complexities transparently

## Tips & Best Practices

### **For Update Mode:**
- Select layers that already have interactions to modify them
- Use selective trigger updating when you want to preserve some interactions
- Great for batch updates across multiple similar elements

### **For Add Mode:**
- Select layers in the exact order you want the flow to progress
- Perfect for onboarding flows, tutorials, or step-by-step guides
- Each layer will link to the next in the selection order

### **Performance Tips:**
- The plugin handles large selections efficiently
- Real-time updates provide immediate feedback
- All changes are applied atomically for consistency

## Troubleshooting

**"Please select at least one supported layer"**
- Ensure you've selected layers that support interactions (see supported types above)

**"Please select at least 2 layers for add mode"**
- Add mode requires multiple layers to create connections between them

**Selection not updating?**
- The plugin automatically detects selection changes
- Try clicking the refresh button or reopening the plugin

## Development

This plugin is built with:
- **TypeScript** for type safety and better development experience
- **Modern UI** with dark theme matching Figma's design system
- **Responsive Design** that adapts to different screen sizes
- **Real-time Updates** for seamless user experience

---

*Streamline your Figma prototyping with automated interaction management!*
