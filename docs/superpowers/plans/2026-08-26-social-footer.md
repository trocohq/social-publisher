# Troco Social Footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the four official Troco social profiles to the website footer as accessible, correctly ordered, recognizable brand icons.

**Architecture:** The `frontend` repository owns one typed social-profile constant and one reusable server-safe icon-link component. The existing footer places that component immediately before language and appearance controls, while the three typed dictionaries supply only the social-group accessibility label. React Icons 5.7.0 supplies pinned Simple Icons paths through the package lock.

**Tech Stack:** Next.js 16.3, React 19, strict TypeScript, Tailwind CSS 4, React Icons 5.7.0, Vitest, Testing Library, Node contract tests

---

## Prerequisite and working directory

Run every command in `../frontend` from the `social-publisher` repository. Preserve unrelated frontend changes and follow `frontend/AGENTS.md`.

## File map

- `lib/constants/site.ts`: canonical typed social IDs, labels, and exact profile URLs.
- `components/social-links/index.tsx`: ordered 44×44 icon links and focus/hover behavior.
- `components/site-footer/index.tsx`: one integration point before preference controls.
- `lib/i18n/messages/pt-br.ts`, `en.ts`, `es.ts`: localized navigation label for the social group.
- `tests/social-links.test.tsx`: rendered accessibility, URL, security-attribute, and order contracts.
- `tests/site-contract.test.mjs`: source-level guarantee that footer integration and exact destinations remain present.
- `package.json`, `package-lock.json`: exact `react-icons` dependency and transitive integrity lock.

## Task 1: Centralize the four exact official profile URLs

**Files:**

- Modify: `lib/constants/site.ts`
- Modify: `tests/site-contract.test.mjs`

- [ ] **Step 1: Write a failing exact-destination contract**

Append to `tests/site-contract.test.mjs`:

```js
test("the site keeps the four official Troco social profiles in one typed constant", async () => {
  const site = await source("lib/constants/site.ts");

  const profiles = [
    ["instagram", "Instagram", "https://www.instagram.com/trocohq"],
    ["tiktok", "TikTok", "https://www.tiktok.com/@trocofacil.app"],
    ["youtube", "YouTube", "https://www.youtube.com/@trocohq"],
    ["facebook", "Facebook", "https://www.facebook.com/trocohq"],
  ];

  let previousIndex = -1;
  for (const [id, label, href] of profiles) {
    assert.match(site, new RegExp(`id:\\s*["']${id}["']`));
    assert.match(site, new RegExp(`label:\\s*["']${label}["']`));
    assert.match(site, new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const currentIndex = site.indexOf(href);
    assert.ok(
      currentIndex > previousIndex,
      `${label} must remain in the approved order`,
    );
    previousIndex = currentIndex;
  }
});
```

- [ ] **Step 2: Run the contract and verify failure**

Run: `node --test --test-name-pattern="four official Troco social profiles" tests/site-contract.test.mjs`

Expected: FAIL because `SOCIAL_PROFILES` is not defined.

- [ ] **Step 3: Add the immutable typed constant**

Append to `lib/constants/site.ts`:

```ts
export const SOCIAL_PROFILE_IDS = [
  "instagram",
  "tiktok",
  "youtube",
  "facebook",
] as const;

export type SocialProfileId = (typeof SOCIAL_PROFILE_IDS)[number];

export type SocialProfile = Readonly<{
  id: SocialProfileId;
  label: "Instagram" | "TikTok" | "YouTube" | "Facebook";
  href: `https://${string}`;
}>;

export const SOCIAL_PROFILES = [
  {
    id: "instagram",
    label: "Instagram",
    href: "https://www.instagram.com/trocohq",
  },
  {
    id: "tiktok",
    label: "TikTok",
    href: "https://www.tiktok.com/@trocofacil.app",
  },
  { id: "youtube", label: "YouTube", href: "https://www.youtube.com/@trocohq" },
  {
    id: "facebook",
    label: "Facebook",
    href: "https://www.facebook.com/trocohq",
  },
] as const satisfies readonly SocialProfile[];
```

- [ ] **Step 4: Run the exact-destination contract**

Run: `node --test --test-name-pattern="four official Troco social profiles" tests/site-contract.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit canonical destinations**

```bash
git add lib/constants/site.ts tests/site-contract.test.mjs
git commit -m "feat: add official social profile constants"
```

## Task 2: Build the accessible social-link component with trusted icons

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `components/social-links/index.tsx`
- Create: `tests/social-links.test.tsx`

- [ ] **Step 1: Install the stable icon package at an exact version**

Run: `npm install --save-exact react-icons@5.7.0`

Expected: `package.json` contains `"react-icons": "5.7.0"`; `package-lock.json` records its integrity; install exits `0`.

- [ ] **Step 2: Write a failing rendered component contract**

```tsx
// tests/social-links.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { SocialLinks } from "@/components/social-links";

describe("SocialLinks", () => {
  test("renders the four official destinations in the approved order", () => {
    render(<SocialLinks label="Troco social media" />);
    const expected = [
      ["Instagram", "https://www.instagram.com/trocohq"],
      ["TikTok", "https://www.tiktok.com/@trocofacil.app"],
      ["YouTube", "https://www.youtube.com/@trocohq"],
      ["Facebook", "https://www.facebook.com/trocohq"],
    ] as const;

    const links = screen.getAllByRole("link");
    expect(
      screen.getByRole("navigation", { name: "Troco social media" }),
    ).toBeTruthy();
    expect(links).toHaveLength(4);
    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual(
      expected.map(([label]) => label),
    );
    expected.forEach(([label, href], index) => {
      expect(links[index]).toHaveAttribute("href", href);
      expect(links[index]).toHaveAttribute("target", "_blank");
      expect(links[index]).toHaveAttribute("rel", "noopener noreferrer");
      expect(
        screen.getByRole("link", { name: label }).querySelector("svg"),
      ).not.toBeNull();
    });
  });
});
```

- [ ] **Step 3: Run the component test and verify failure**

Run: `npx vitest run tests/social-links.test.tsx`

Expected: FAIL because `@/components/social-links` does not exist.

- [ ] **Step 4: Implement the ordered 44×44 icon links**

```tsx
// components/social-links/index.tsx
import { SOCIAL_PROFILES, type SocialProfileId } from "@/lib/constants/site";
import type { IconType } from "react-icons";
import { SiFacebook, SiInstagram, SiTiktok, SiYoutube } from "react-icons/si";

const icons = {
  instagram: SiInstagram,
  tiktok: SiTiktok,
  youtube: SiYoutube,
  facebook: SiFacebook,
} satisfies Readonly<Record<SocialProfileId, IconType>>;

export function SocialLinks({
  label,
}: Readonly<{ label: string }>): React.ReactNode {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap items-center gap-2">
        {SOCIAL_PROFILES.map((profile) => {
          const Icon = icons[profile.id];
          return (
            <li key={profile.id}>
              <a
                aria-label={profile.label}
                className="inline-flex size-11 items-center justify-center rounded-full border border-white/20 text-white transition-colors hover:border-brand hover:bg-brand hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
                href={profile.href}
                rel="noopener noreferrer"
                target="_blank"
              >
                <Icon aria-hidden="true" className="size-5" focusable="false" />
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 5: Run the component and full test suites**

Run: `npx vitest run tests/social-links.test.tsx && npm test`

Expected: the component contract and all existing tests PASS.

- [ ] **Step 6: Commit the component**

```bash
git add package.json package-lock.json components/social-links/index.tsx tests/social-links.test.tsx
git commit -m "feat: add accessible social footer links"
```

## Task 3: Integrate social links before footer preference controls

**Files:**

- Modify: `components/site-footer/index.tsx`
- Modify: `lib/i18n/messages/pt-br.ts`
- Modify: `lib/i18n/messages/en.ts`
- Modify: `lib/i18n/messages/es.ts`
- Modify: `tests/site-contract.test.mjs`

- [ ] **Step 1: Write a failing footer-placement contract**

Append to `tests/site-contract.test.mjs`:

```js
test("the footer renders social links before language and appearance controls", async () => {
  const footer = await source("components/site-footer/index.tsx");
  assert.match(
    footer,
    /import\s*{\s*SocialLinks\s*}\s*from\s*["']@\/components\/social-links["']/,
  );
  const socialIndex = footer.indexOf("<SocialLinks label={m.social} />");
  const languageIndex = footer.indexOf("<LanguageSelector />");
  const themeIndex = footer.indexOf("<ThemeToggle />");
  assert.ok(
    socialIndex >= 0 &&
      socialIndex < languageIndex &&
      languageIndex < themeIndex,
  );
});
```

- [ ] **Step 2: Run the placement contract and verify failure**

Run: `node --test --test-name-pattern="footer renders social links" tests/site-contract.test.mjs`

Expected: FAIL because `SiteFooter` does not render `SocialLinks`.

- [ ] **Step 3: Integrate the component without changing footer navigation**

Add `social` to the existing footer object in every typed dictionary:

```ts
// lib/i18n/messages/pt-br.ts
social: "Redes sociais do Troco",

// lib/i18n/messages/en.ts
social: "Troco social media",

// lib/i18n/messages/es.ts
social: "Redes sociales de Troco",
```

Add this import to `components/site-footer/index.tsx`:

```tsx
import { SocialLinks } from "@/components/social-links";
```

Replace the existing preference row with:

```tsx
<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
  <SocialLinks label={m.social} />
  <div className="flex items-center gap-3 text-white">
    <LanguageSelector />
    <ThemeToggle />
  </div>
</div>
```

Keep this row inside the current lower-right `flex flex-col gap-6 lg:items-end` block and before copyright. Do not alter any existing route, footer heading, localized text, Trebla credit, or Play Store link.

- [ ] **Step 4: Run frontend validation**

Run: `npm test && npm run lint && npm run build`

Expected: all tests PASS, ESLint exits `0`, Next static export succeeds, and `out/index.html` exists.

- [ ] **Step 5: Verify the responsive and keyboard contract manually**

Run: `npm run dev`

Open the local site at mobile and desktop widths in light, dark, and system appearances. Verify Instagram, TikTok, YouTube, and Facebook appear in order; every target is at least 44×44 px; Tab shows a visible green focus ring; Enter opens the exact profile in a new tab; the row wraps without clipping; the language/theme controls, copyright, and Trebla credit remain usable in Portuguese, English, and Spanish.

- [ ] **Step 6: Commit footer integration**

```bash
git add components/site-footer/index.tsx lib/i18n/messages/pt-br.ts lib/i18n/messages/en.ts lib/i18n/messages/es.ts tests/site-contract.test.mjs
git commit -m "feat: show social networks in site footer"
```

## Footer-plan completion gate

Run in `frontend`:

```bash
npm test
npm run lint
npm run build
git status --short
```

Expected: all commands exit `0`, only the intended social-footer commits exist, the exact official destinations are centralized once, and the frontend contains no publisher credentials or scheduling behavior.
