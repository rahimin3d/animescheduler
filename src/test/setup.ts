import '@testing-library/jest-dom/vitest'

// jsdom doesn't implement scrolling; leaving the landing page scrolls to the top.
window.scrollTo = () => {}
