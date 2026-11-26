export default defineAppConfig({
  ui: {
    colors: { primary: 'neutral', neutral: 'zinc' },
    button: { defaultVariants: { size: 'sm' } },
    input: { defaultVariants: { size: 'md' } },
    select: { defaultVariants: { size: 'md' } },
    badge: { defaultVariants: { size: 'sm' } },
    navigationMenu: {
      slots: {
        link: 'text-sm py-1.5',
      },
    },
  },
})
