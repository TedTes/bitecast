/** The one wave used wherever water meets a page: the shoreline header and the tab bar. */
export const wavePath = (width: number, y: number) => `M0 ${y} Q${width * 0.25} ${y - 3} ${width * 0.5} ${y} T${width} ${y}`;
