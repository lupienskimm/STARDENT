/** Viewport units become custom properties with the unit itself as fallback, so nothing changes until lib/page-zoom.ts
 * sets them. While a narrower desktop window shows the page zoomed to the design width, --vw and --vh hold the values
 * of that width; CSS zoom would otherwise shrink vw and vh a second time. */
const UNIT = /(-?(?:\d+\.?\d*|\.\d+))(dvh|svh|lvh|vw|vh)\b/gi;

module.exports = () => ({
  postcssPlugin: "zoom-units",
  Declaration(decl) {
    if (!/\d(?:dvh|svh|lvh|vw|vh)\b/i.test(decl.value) || decl.value.includes("var(--vw") || decl.value.includes("var(--vh")) return;
    decl.value = decl.value.replace(UNIT, (_, n, u) => {
      const unit = u.toLowerCase();
      return `calc(var(${unit === "vw" ? "--vw" : "--vh"}, 1${unit}) * ${n})`;
    });
  },
});
module.exports.postcss = true;
