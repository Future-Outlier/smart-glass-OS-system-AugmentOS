# MentraOS Manager Development Guidelines

This guide provides coding standards and best practices for contributing to MentraOS Manager, the React Native mobile app component of the MentraOS ecosystem.

## Architecture Overview

MentraOS Manager is a React Native app built with:

- **Expo** for development tooling and managed workflow
- **expo-router** for file-based routing
- **React Context API** for state management
- **TypeScript** for type safety

## Code Style Guidelines

### Theme and Styling

**Don't import `theme` directly**. Instead, use the `useAppTheme` hook:

```tsx
import {useAppTheme} from "@/utils/useAppTheme"

// In your component:
function MyComponent() {
  const {theme, themed} = useAppTheme()

  return <View style={themed($container)} />
}
```

**Don't create StyleSheets**. Use themed styles instead:

```tsx
// Define styles as functions that receive theme properties
const $container: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
  padding: spacing.md,
})

const $text: ThemedStyle<TextStyle> = ({colors, typography}) => ({
  color: colors.text,
  fontSize: typography.body,
  flexWrap: "wrap",
})

// Use in component with themed()
<View style={themed($container)}>
  <Text style={themed($text)}>Hello</Text>
</View>
```

### Navigation

**Don't use expo router's navigation methods directly**. Use the `useNavigationHistory()` hook:

```tsx
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"

function MyComponent() {
  const {goBack, push, replace} = useNavigationHistory()

  // Navigate to a screen
  push("/settings/profile")

  // Replace current screen
  replace("/home")

  // Go back
  goBack()
}
```

### Internationalization (i18n)

**Use the tx prop for translations** on Ignite components:

```tsx
<Screen safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
  <Text tx="settingsScreen:title" />
  <Button tx="common:save" onPress={handleSave} />
</Screen>
```

**Define your strings** in the appropriate language file (`src/i18n/en.ts`):

```tsx
export default {
  settingsScreen: {
    title: "Settings",
    description: "Manage your preferences",
  },
  common: {
    save: "Save",
    cancel: "Cancel",
  },
}
```

**Use translate() for strings in code**:

```tsx
import {translate} from "@/i18n"

function MyComponent() {
  const showAlert = () => {
    Alert.alert(translate("alerts:error"), translate("alerts:somethingWentWrong"))
  }
}
```

## Project Structure

```
src/
├── app/              # File-based routes (expo-router)
├── components/       # Reusable components (categorized)
├── contexts/         # React Context providers
├── bridge/           # Native module bridges
├── config/           # App configuration
├── i18n/             # Internationalization
├── services/         # Business logic services
├── utils/            # Utility functions
└── theme/            # Theme configuration
```

## Component Guidelines

### File Organization

- Place screen components in `src/app/` following the routing structure
- Organize reusable components in `src/components/` by feature
- Use `misc/` folder for components that don't fit a specific category

### Component Structure

```tsx
import React from "react"
import {View} from "react-native"
import {Text, Button} from "@/components"
import {useAppTheme} from "@/utils/useAppTheme"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {translate} from "@/i18n"

export function MyComponent() {
  const {theme, themed} = useAppTheme()
  const {push} = useNavigationHistory()

  return (
    <View style={themed($container)}>
      <Text tx="myComponent:title" />
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({spacing}) => ({
  padding: spacing.md,
})
```

## Import Guidelines

### Import Order

1. External dependencies (React, React Native, third-party packages)
2. Internal absolute imports (@/ paths)
3. Relative imports (if necessary)

### Example

```tsx
// External imports
import React, {useState, useEffect} from "react"
import {View, Alert} from "react-native"
import {observer} from "mobx-react-lite"

// Internal absolute imports
import {Screen, Text, Button} from "@/components"
import {useAppTheme} from "@/utils/useAppTheme"
import {translate} from "@/i18n"
import {useStores} from "@/models"

// Types
import type {ThemedStyle} from "@/theme"
```

## Best Practices

### Error Handling

Always wrap async operations in try-catch blocks with meaningful error messages:

```tsx
try {
  const result = await someAsyncOperation()
  // Handle success
} catch (error) {
  console.error("Failed to perform operation:", error)
  Alert.alert(translate("errors:title"), translate("errors:genericMessage"))
}
```

### Performance

- Use React.memo for expensive components
- Leverage useMemo and useCallback for expensive computations
- Avoid inline styles and functions in render

### Type Safety

- Always define proper TypeScript types
- Avoid using `any` type
- Use strict null checks

## Testing

Run tests with:

```bash
bun test
bun test:watch  # Watch mode
bun test -- -t "specific test"  # Run specific test
```

## Linting and Type Checking

Before committing:

```bash
bun lint     # Check for linting errors
bun compile  # Type check
```

## Native Development

### Important: Prebuild Warning

**Never use `--clean` or `--clear` flags with expo prebuild!**

```bash
# ✅ Correct
bun expo prebuild

# ❌ NEVER do this - it will delete custom native code
bun expo prebuild --clean
bun expo prebuild --clear
```

This project contains custom native modules that must be preserved.

## Additional Resources

- [General Contributing Guidelines](/contributing)
- [MentraOS Architecture Overview](/core-concepts)
- [React Native Best Practices](https://reactnative.dev/docs/performance)
