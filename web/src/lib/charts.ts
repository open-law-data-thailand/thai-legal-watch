/** The parts of ECharts this site actually draws.
 *
 *  `import('echarts')` pulls the whole library — every chart type, every component, both
 *  renderers — which measured at 1.1 MB, 358 KB over the wire, on the two routes that draw. The
 *  site draws exactly two things: a bar chart of documents per year, and a force graph of topics.
 *  Naming them costs one module and takes most of that back.
 *
 *  Both renderers are registered because the two routes want different ones: the year chart is
 *  SVG so its bars stay crisp and reachable, and the force graph is canvas because a thousand
 *  nodes as DOM elements is not a thing a phone can move.
 */
import * as echarts from 'echarts/core'
import { BarChart, GraphChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers'

echarts.use([BarChart, GraphChart, GridComponent, TooltipComponent, SVGRenderer, CanvasRenderer])

export const init = echarts.init
export type EChartsInstance = ReturnType<typeof echarts.init>
