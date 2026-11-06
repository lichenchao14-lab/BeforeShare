/**
 * 导出提醒卡长图：先在离屏容器里克隆一份 750px 宽度的副本，再渲染。
 * 直接对页面内的节点导出会被父容器的 maxWidth:100% 压窄，导致手机上导出的图不是 750px。
 */
export async function exportCardImage(node: HTMLElement): Promise<string> {
  const clone = node.cloneNode(true) as HTMLElement;
  clone.style.width = "750px";
  clone.style.maxWidth = "750px";
  clone.style.margin = "0";

  const holder = document.createElement("div");
  holder.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    "width:750px",
    "background:#fbf7ef",
    "pointer-events:none",
    "z-index:-1",
  ].join(";");
  holder.appendChild(clone);
  document.body.appendChild(holder);

  try {
    const { toPng } = await import("html-to-image");
    return await toPng(clone, {
      pixelRatio: 2,
      backgroundColor: "#fbf7ef",
      width: 750,
      height: clone.scrollHeight,
    });
  } finally {
    document.body.removeChild(holder);
  }
}
