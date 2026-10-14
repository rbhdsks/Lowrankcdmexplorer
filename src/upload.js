// Deliberately narrow CSV format: menu items separated by | and a chosen item.
// Keeping the format explicit avoids silently guessing which columns in a
// research dataset describe availability and which describe the winner.
export function parseChoiceCSV(text) {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 61) throw new Error("Upload at least 60 choices plus a header for train/validation/test splits.");
  if (lines.length > 10001) throw new Error("This browser demo supports at most 10,000 choice rows.");
  const header = lines.shift().toLowerCase().replaceAll('"', "").replaceAll(" ", "");
  if (header !== "menu,chosen") throw new Error("CSV header must be exactly: menu,chosen");
  const parsed = lines.map((line, index) => {
    const parts = line.split(",").map(value => value.trim().replace(/^"|"$/g, ""));
    if (parts.length !== 2) throw new Error(`Row ${index + 2}: expected menu,chosen.`);
    const menu = parts[0].split("|").map(value => value.trim());
    const chosen = parts[1];
    if ([...menu, chosen].some(value => !/^[\p{L}\p{N}_ .-]{1,40}$/u.test(value))) {
      throw new Error(`Row ${index + 2}: item names must be 1–40 letters, numbers, spaces, _, . or -.`);
    }
    if (menu.length < 2 || new Set(menu).size !== menu.length || menu.some(value => !value)) {
      throw new Error(`Row ${index + 2}: provide at least two different menu items separated by |.`);
    }
    if (!menu.includes(chosen)) throw new Error(`Row ${index + 2}: chosen item must be in the menu.`);
    return { menu, chosen };
  });
  const labels = [...new Set(parsed.flatMap(row => row.menu))].sort((a, b) => a.localeCompare(b));
  if (labels.length < 3 || labels.length > 8) throw new Error("Use 3–8 distinct item labels for this browser demo.");
  const indices = new Map(labels.map((label, index) => [label, index]));
  return {
    labels,
    rows: parsed.map(row => ({ menu: row.menu.map(label => indices.get(label)).sort((a, b) => a - b), chosen: indices.get(row.chosen) })),
  };
}
