/** Memory reference from the published v1.10.0 benchmark. Current server startup
 * retains normalized text even when `verify_text` is off, so historical off-mode
 * measurements cannot be used as a sizing estimate for v1.10.2.
 */
import benchmark from './benchmark-v1.10.0.json'

/** `verify_text: all` in that benchmark, normalized per million documents. */
export const VERIFY_ALL_PER_MILLION_GB = benchmark.memory.perMillionDocumentsGb

/** Linear extrapolation for planning; add headroom and measure the workload. */
export const PLANNING_10M_ALL_GB = Math.round(VERIFY_ALL_PER_MILLION_GB * 10)
