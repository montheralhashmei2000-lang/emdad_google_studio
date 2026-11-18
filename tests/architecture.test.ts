import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { APP_VERSION } from '../src/core/appVersion';
import { LOCAL_ONLY_CONFIG_KEYS } from '../src/data/migration/dataMigration';
import { SCHEMA_VERSION } from '../src/data/db';

const ROOT = process.cwd();

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(full));
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

describe('Architecture & Layering Guard', () => {
  it('domain_purity: src/domain has zero React, UI, Data, Core, or DOM/IndexedDB imports', () => {
    const domainFiles = listTsFiles(path.join(ROOT, 'src/domain'));
    expect(domainFiles.length).toBeGreaterThanOrEqual(15);

    const forbidden = /(from\s+['"]react|from\s+['"]\.\.\/(core|data|components|features)|window\.|document\.|indexedDB)/;
    for (const file of domainFiles) {
      const code = fs.readFileSync(file, 'utf8');
      expect(code, `Domain purity violation in ${path.relative(ROOT, file)}`).not.toMatch(forbidden);
    }
  });

  it('layering: src/data does not import features or UI components', () => {
    const dataFiles = listTsFiles(path.join(ROOT, 'src/data'));
    const forbidden = /from\s+['"]\.\.\/(features|components)/;
    for (const file of dataFiles) {
      const code = fs.readFileSync(file, 'utf8');
      expect(code, `Layering violation in ${path.relative(ROOT, file)}`).not.toMatch(forbidden);
    }
  });

  it('app_version: APP_VERSION matches package.json version and SettingsScreen uses it', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { version: string };
    expect(APP_VERSION).toBe(pkg.version);
    const settingsCode = fs.readFileSync(path.join(ROOT, 'src/features/settings/SettingsScreen.tsx'), 'utf8');
    expect(settingsCode).toContain('APP_VERSION');
  });

  it('schema & local-only keys match v31 baseline', () => {
    expect(SCHEMA_VERSION).toBe(31);
    expect(LOCAL_ONLY_CONFIG_KEYS.length).toBeGreaterThanOrEqual(14);
    expect(LOCAL_ONLY_CONFIG_KEYS).toContain('deviceId');
    expect(LOCAL_ONLY_CONFIG_KEYS).toContain('activationToken');
  });

  it('android_compose_kotlin: verifies root Kotlin + Jetpack Compose Android project (Room SQLCipher v31, RTL, 900.dp ImdTable, all 15 Supply + 7 Fuel doors)', () => {
    expect(fs.existsSync(path.join(ROOT, 'settings.gradle.kts'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'build.gradle.kts'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'gradle.properties'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'gradle/libs.versions.toml'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'app/build.gradle.kts'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'app/src/main/AndroidManifest.xml'))).toBe(true);

    const themeKt = fs.readFileSync(
      path.join(ROOT, 'app/src/main/java/com/imdad/erp/core/theme/ImdTheme.kt'),
      'utf8'
    );
    expect(themeKt).toContain('LocalLayoutDirection provides LayoutDirection.Rtl');
    expect(themeKt).toContain('val MobileMax: Dp = 900.dp');
    expect(themeKt).toContain('val TouchMin: Dp = 46.dp');

    const componentsKt = fs.readFileSync(
      path.join(ROOT, 'app/src/main/java/com/imdad/erp/core/ui/ImdComponents.kt'),
      'utf8'
    );
    expect(componentsKt).toContain('fun <T> ImdTable(');
    expect(componentsKt).toContain('stickyHeader');

    const dbKt = fs.readFileSync(
      path.join(ROOT, 'app/src/main/java/com/imdad/erp/data/db/AppDatabase.kt'),
      'utf8'
    );
    expect(dbKt).toContain('const val K_SCHEMA_VERSION = 31');
    expect(dbKt).toContain('SupportOpenHelperFactory');
    expect(dbKt).toContain('CREATE INDEX IF NOT EXISTS ix_${t}_wh_item');

    const homeShellKt = fs.readFileSync(
      path.join(ROOT, 'app/src/main/java/com/imdad/erp/ui/screens/HomeShellScreen.kt'),
      'utf8'
    );
    expect(homeShellKt).toContain('ComposeDoorDef("dashboard"');
    expect(homeShellKt).toContain('ComposeDoorDef("campAccounts"');
    expect(homeShellKt).toContain('ComposeDoorDef("cables"');
    expect(homeShellKt).toContain('ComposeDoorDef("fuelAllocations"');

    const toml = fs.readFileSync(path.join(ROOT, 'gradle/libs.versions.toml'), 'utf8');
    expect(toml).not.toMatch(/window_manager|flutter_acrylic|desktop_drop/);
  });
});

