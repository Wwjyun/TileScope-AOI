---
name: aoi-release
description: Package and publish Windows releases for TileScope AOI. Use when the user asks to 打包, package, build the desktop installer, choose or bump a release version, tag a release, publish GitHub Release assets, reuse a previous release procedure, verify PyInstaller output (sidecar / Classic / utilities), or prepare CPU-compatible/CUDA-enabled distribution artifacts.
---

# AOI Release

Separate a local package request from a published release. Do not create tags or GitHub releases unless the user requested publication.

## Choose the scope

- **Desktop installer (primary)**: build and verify `dist\desktop\TileScope-AOI-<v>-setup.exe` from the Tauri 2 desktop app and the frozen sidecar. This is the TileScope AOI application artifact.
- **Classic package (optional, kept during migration)**: the PySide6 "TileScope AOI Classic" distribution via `packaging\scripts\build_exe.ps1`.
- **Utility bundle**: incremental utility releases keep the `utility-tools-vX.Y.Z` tag namespace (and the legacy NG Tile tool namespace), never the TileScope AOI application tag namespace `vX.Y.Z`.
- For release requests, require an explicit semantic version. Inspect existing tags and releases before creating anything.
- State whether the package is CPU-compatible only or includes a validated CUDA DLL. The native ABI file names keep the `visionflow_cuda*` prefix — the product rename to TileScope AOI did not rename `gpu\visionflow_cuda.dll`, `gpu\include\visionflow_cuda*.h`, or the `vf_*` exports. If CUDA inclusion is required but the DLL was not built and validated for this commit, stop instead of shipping a stale DLL.
- Publication stays private-only while `distribution-policy.json` lists pending reviews: the publish script refuses before any network access. Do not bypass this gate.
- Treat “same as before” or “以前的方式” as a request to inspect the relevant prior release evidence, not to infer Chrome, `gh`, or another transport from memory.

## Reuse a previous CUDA DLL

Rebuild `gpu\visionflow_cuda.dll` only when its inputs changed. Compare the release commit with the previous published CUDA-enabled tag: `git diff --name-only <previous-tag> <release-commit> -- gpu/visionflow_cuda.cu gpu/include gpu/test_cuda_api.cu gpu/build_cuda_dll.ps1`. When that is empty and the CUDA toolkit, MSVC toolset and `sm_86` target are unchanged, reuse the DLL from the previous release: download that release's ZIP, confirm its published SHA-256 and the DLL SHA-256 recorded in `Todo.md`, copy the DLL into the clean worktree's `gpu\`, and still run `gpu\validate_cuda_dll.py --dll gpu\visionflow_cuda.dll --benchmark 20` against this commit, because the Python bridge may have changed. Record which release supplied the reused DLL. Rebuild when those inputs or the toolchain changed, the previous DLL cannot be verified, or the user asks for a rebuild.

## Reuse previous utility EXEs

For an incremental Utility Tools release, inspect the prior published bundle and the changes since its tag before building. When only specific tools changed, run only their dedicated build scripts and reuse unchanged EXEs from the immediately previous published bundle after verifying that bundle's published digest and downloaded ZIP hash; never trust arbitrary files already present in local `dist`. Rebuild every tool only when shared runtime/build inputs changed, the prior asset cannot be verified, or the user explicitly requests a clean rebuild. Record which EXEs were rebuilt and which verified release supplied reused EXEs.

## Prepare

1. Read repository `AGENT.md`, release/deployment sections of `Todo.md`, and the README packaging instructions.
2. Inspect `git status`, branch synchronization, current commit, existing tags, existing release assets, and version-bearing files.
3. Preserve unrelated ZIPs and artifacts. Never infer the next version from an untracked filename alone.
4. Complete the change-scoped validation from `aoi-verify-push` (including the sidecar smoke test) for the release contents.
5. Bump the version in all three desktop files together and keep them equal: `desktop\src-tauri\tauri.conf.json`, `desktop\src-tauri\Cargo.toml`, `desktop\package.json`. Update Todo and release-facing documentation consistently, then commit and push before tagging.

## Build and verify

### Desktop installer (primary)

1. Run `packaging\scripts\build_desktop.ps1 -Version x.y.z [-WebView2Mode offlineInstaller|embedBootstrapper|downloadBootstrapper] [-SkipEnvironmentCheck]` from the repository root.
   - It freezes the sidecar with `packaging\specs\aoi-sidecar.spec`, runs `aoi-sidecar.exe --smoke-test`, stages `desktop/` under an ASCII path when the repo path is non-ASCII (vite/rollup segfault otherwise), then `npx tauri build` (NSIS) → `dist\desktop\TileScope-AOI-<v>-setup.exe`.
2. Verify the installer: record the frozen sidecar smoke output, confirm the frozen sidecar onedir has no Qt runtime outside the collected license evidence, and record installer size + SHA-256.
3. Create `release_artifacts\TileScope-AOI-vX.Y.Z-windows-x64.zip` containing the installer, never the installer path alone.

### Classic package (optional)

1. Run `packaging\scripts\build_exe.ps1` from the repository root.
2. Verify the "TileScope AOI Classic" distribution folder, bundled recipes, required Qt/runtime files, and presence/absence of `gpu\visionflow_cuda.dll` according to the intended package.
3. Smoke-test the packaged application on the available machine. Record any GPU/no-GPU matrix that still requires another computer.
4. Create `release_artifacts\TileScope-AOI-Classic-vX.Y.Z-windows-x64.zip` from the whole distribution folder, never the executable alone.

Do not overwrite an existing same-version package without explicit approval.

## Choose the publication transport

Honor an explicit user-selected transport. Otherwise use the first authenticated, non-interactive path already proven for this repository:

1. Existing repository release automation, when it already publishes the requested artifact from the validated tag.
2. Git credential-backed GitHub Releases REST API via the bundled publish script.
3. Chrome only when the task depends on the signed-in browser or the user explicitly selects it.
4. `gh` only when it is authenticated and consistent with the user's request.

For this repository, the proven unattended method is the bundled REST script. It uses the credential already available to `git push`; it does not require `gh auth login` or Chrome file access.

If Chrome returns `Not allowed` while setting a local file, do not repeatedly retry or conclude that GitHub rejected the asset. That error occurs before GitHub receives the file. If the user authorized publication and the REST preflight succeeds, continue with the proven REST method. If the user explicitly required Chrome, report the Chrome file-URL permission blocker instead of silently changing transports.

Never print, persist, or return the credential produced by `git credential fill`. Keep it in memory only and emit sanitized release/asset metadata.

## Publish through the Releases API

Use the bundled script from the repository root:

```powershell
$publishScript = '.\.claude\skills\aoi-release\scripts\publish_github_release.ps1'
& $publishScript `
  -Repository 'Wwjyun/TileScope-AOI' `
  -Tag 'vX.Y.Z' `
  -AssetPath '.\release_artifacts\TileScope-AOI-vX.Y.Z-windows-x64.zip' `
  -ReleaseName 'TileScope AOI vX.Y.Z' `
  -BodyPath '.\docs\release-notes\tilescope-aoi-vX.Y.Z.md' `
  -ExpectedCommit '<full-commit-sha>' `
  -ExpectedSha256 '<sha256>' `
  -PreflightOnly
```

The `-Repository` value is the current private remote. Renaming the GitHub repository remains a pending `Todo.md` decision and requires explicit authorization — do not change it here.

Review the sanitized preflight result, then rerun without `-PreflightOnly`. The live flow must:

1. Confirm the annotated/lightweight remote tag resolves to the expected commit and that commit is contained in `origin/main`.
2. Refuse an existing same-tag release or ambiguous same-name asset.
3. Create the release as a draft.
4. Upload the ZIP with the in-memory Git credential.
5. Confirm the uploaded byte count, then publish the draft as the latest non-prerelease.
6. Re-fetch the public release, download its canonical asset URL, and verify size and SHA-256.
7. Leave a draft, not an empty public release, if upload or publication fails.

## Final verification

Confirm the release commit is on `origin/main`, the remote tag resolves to it, and the release page shows exactly one expected asset. Independently verify the published asset name, byte count, and checksum, and — for the desktop installer — that the artifact contains the installer produced by a sidecar smoke-verified build and the intended CUDA DLL presence. Do not treat a successful API response alone as completed publication.

Do not mark untested GPU, no-GPU, stress, or production-recipe acceptance as complete. Report the commit, tag, release URL, direct download URL, asset checksum, CUDA inclusion status, and any remaining cross-machine validation.
