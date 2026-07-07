/** Stable no-op — handed to framer-motion's onUpdate to keep element styles
 * driven every frame (identical reference avoids re-render churn). */
export const noop = () => {};
