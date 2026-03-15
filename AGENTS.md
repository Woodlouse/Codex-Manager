# Frontend Engineering Standards (apps_new)

This document outlines the architectural constraints and coding conventions for the refactored Next.js frontend.

## 1. Tech Stack
- **Framework**: Next.js 14+ (App Router).
- **Language**: TypeScript (Strict mode).
- **Styling**: Tailwind CSS v4.
- **UI Components**: shadcn/ui (based on @base-ui/react).
- **State Management**: Zustand.
- **Data Fetching**: TanStack Query (React Query) v5.
- **Runtime**: Tauri v2.

## 2. Design Language: Glassmorphism & Themes
- **Ambient Background**: Use vibrant mesh gradients defined in `globals.css` that sync with the active theme.
- **Glass Material**: 
  - Use `.glass-sidebar` for the navigation bar.
  - Use `.glass-header` for the top bar.
  - Use `.glass-card` for main content containers.
- **Performance Mode**: Always respect the `low-transparency` class on the `body`. When active, all blurs and gradients MUST be disabled in favor of solid colors (`var(--card-solid)`).
- **Themes**: Support all 11 core themes (Enterprise Blue, Pure Black, Dark One, etc.) using `next-themes`.

## 3. Component Guidelines
- **Logic Separation**: Keep components "dumb" by moving complex logic into custom hooks (e.g., `useAccounts`, `useDashboardStats`).
- **Semantic HTML**: Avoid nested `<button>` elements. Use `render={<span />}` and `nativeButton={false}` on triggers (like DropdownMenuTrigger) to maintain accessibility without breaking HTML specs.
- **Client Components**: Mark interactive components with `"use client"`. Prefer Server Components for static layouts where possible.

## 4. API & IPC Standards
- **Transport**: Use the centralized `invoke` and `invokeFirst` helpers from `@/lib/api/transport`.
- **Addressing**: Always use `withAddr()` to wrap IPC parameters ensuring the backend service address is correctly injected.
- **Error Handling**: Standardize business error unwrapping in the transport layer to show consistent toast notifications.
- **No Fetch for IPC**: Do not use `fetch()` for backend commands in the desktop environment; use Tauri's native `invoke` for maximum reliability and speed.

## 5. Directory Structure
- `app/`: Routing and page layouts.
- `components/ui/`: Atomic shadcn components.
- `components/modals/`: Feature-specific dialogs.
- `hooks/`: Business logic hooks.
- `lib/api/`: Typed backend client wrappers.
- `store/`: Zustand global state stores.
- `types/`: Shared TypeScript interfaces.

## 6. Development Workflow
- **Validation**: Every significant change must be verified with `pnpm run build:desktop` to ensure static export compatibility.
- **Sync**: Ensure all new backend commands are added to `lib/api/` with correct underscore/camelCase mapping.