import { describe, expect, it } from "vitest";
import { resolveWorkspace } from "../../src/features/ingestion/ingestion.workspace.js";

const scratchRoot = "C:\\Users\\me\\AppData\\Roaming\\Claude\\scratch-workspaces";

function resolverWithRepos(...repoRoots: string[]) {
  const roots = repoRoots.map((root) => root.toLowerCase());
  return (cwd: string): string | null => {
    let current = cwd;
    for (;;) {
      if (roots.includes(current.toLowerCase())) return current;
      const parent = current.replace(/[\\/][^\\/]*$/, "");
      if (parent === current) return null;
      current = parent;
    }
  };
}

describe("resolveWorkspace", () => {
  it("puts every scratch workspace of the desktop app in the Scratch group", () => {
    // Act
    const workspace = resolveWorkspace("c:\\users\\me\\appdata\\roaming\\claude\\scratch-workspaces\\abc\\scratch-1", {
      scratchRoot,
      findRepoRoot: resolverWithRepos(),
    });

    // Assert
    expect(workspace).toEqual({ pathKey: "scratch", path: scratchRoot, name: "Scratch", isScratch: true });
  });

  it("puts a worktree in its repository's workspace before looking for a .git", () => {
    // Arrange
    const cwd = "C:\\WS\\shop\\.claude\\worktrees\\brave-turing-12";

    // Act
    const workspace = resolveWorkspace(cwd, { scratchRoot, findRepoRoot: resolverWithRepos(cwd, "C:\\WS\\shop") });

    // Assert
    expect(workspace).toEqual({ pathKey: "c:/ws/shop", path: "C:\\WS\\shop", name: "shop", isScratch: false });
  });

  it("recognises a worktree written with forward slashes", () => {
    // Act
    const workspace = resolveWorkspace("/home/me/shop/.claude/worktrees/x/src", {
      scratchRoot,
      findRepoRoot: resolverWithRepos(),
    });

    // Assert
    expect(workspace.pathKey).toBe("/home/me/shop");
  });

  it("puts a subfolder of a repository in the repository's workspace", () => {
    // Act
    const workspace = resolveWorkspace("C:\\WS\\shop\\api\\src", {
      scratchRoot,
      findRepoRoot: resolverWithRepos("C:\\WS\\shop"),
    });

    // Assert
    expect(workspace).toEqual({ pathKey: "c:/ws/shop", path: "C:\\WS\\shop", name: "shop", isScratch: false });
  });

  it("keeps a folder outside any repository as its own workspace", () => {
    // Act
    const workspace = resolveWorkspace("C:\\Users\\me\\notes\\", { scratchRoot, findRepoRoot: resolverWithRepos() });

    // Assert
    expect(workspace).toEqual({
      pathKey: "c:/users/me/notes",
      path: "C:\\Users\\me\\notes",
      name: "notes",
      isScratch: false,
    });
  });

  it("gives case variants of one folder the same key", () => {
    // Arrange
    const options = { scratchRoot, findRepoRoot: resolverWithRepos() };

    // Act
    const upper = resolveWorkspace("C:\\WS\\Shop", options);
    const lower = resolveWorkspace("c:\\ws\\shop", options);

    // Assert
    expect(upper.pathKey).toBe(lower.pathKey);
  });

  it("ignores the scratch rule when the scratch root is unknown", () => {
    // Act
    const workspace = resolveWorkspace("C:\\WS\\demo", { scratchRoot: "", findRepoRoot: resolverWithRepos() });

    // Assert
    expect(workspace.isScratch).toBe(false);
    expect(workspace.name).toBe("demo");
  });
});
