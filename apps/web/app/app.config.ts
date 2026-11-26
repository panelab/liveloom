/**
 * Component defaults for the LiveLoom design system (see assets/css/main.css).
 * Floating things use the raised surface + soft shadow; controls are compact;
 * the solid primary button is the accent with white text in both themes.
 */
const raised = 'surface-raised ring-0 rounded-lg'

export default defineAppConfig({
  ui: {
    colors: { primary: 'indigo', neutral: 'zinc' },
    button: {
      slots: { base: 'transition-colors duration-100 font-medium' },
      defaultVariants: { size: 'sm' },
      compoundVariants: [
        { color: 'primary', variant: 'solid', class: 'text-(--accent-fg) bg-primary hover:bg-primary/88 active:bg-primary/80 shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(0_0_0/0.2)]' },
        { color: 'neutral', variant: 'outline', class: 'ring-default bg-default hover:bg-elevated' },
        { color: 'neutral', variant: 'ghost', class: 'text-muted hover:text-highlighted hover:bg-elevated' },
      ],
    },
    input: { defaultVariants: { size: 'md' }, slots: { base: 'bg-default' } },
    select: { defaultVariants: { size: 'md' }, slots: { content: raised } },
    selectMenu: { slots: { content: raised } },
    badge: { defaultVariants: { size: 'sm' } },
    dropdownMenu: { slots: { content: `${raised} min-w-44`, item: 'text-sm', separator: 'bg-(--ui-border-muted)' } },
    popover: { slots: { content: raised } },
    tooltip: { slots: { content: 'surface-raised ring-0 text-xs text-toned rounded-md' } },
    modal: { slots: { overlay: 'bg-black/50 backdrop-blur-[2px]', content: `${raised} divide-muted`, title: 'text-base font-semibold', description: 'text-sm text-muted' } },
    slideover: { slots: { content: 'bg-(--surface-raised)' } },
    commandPalette: {
      slots: {
        input: '[&>input]:text-base [&>input]:h-12',
        group: 'p-1.5',
        label: 'px-2 py-1.5 text-xs font-medium text-dimmed',
        item: 'text-sm px-2 py-1.5 before:rounded-md data-highlighted:not-data-disabled:before:bg-elevated',
        itemLeadingIcon: 'size-4 text-muted group-data-highlighted:text-highlighted',
      },
    },
    kbd: { base: 'font-sans font-medium normal-case', defaultVariants: { variant: 'outline', size: 'sm' } },
    switch: { defaultVariants: { size: 'sm' } },
    dashboardNavbar: { slots: { root: 'h-12 border-muted px-4 sm:px-5', title: 'text-sm font-medium' } },
    dashboardPanel: { slots: { root: 'bg-default lg:border-s lg:border-muted lg:not-last:border-e lg:not-last:border-muted overflow-hidden', body: 'p-4 sm:p-6 gap-0 sm:gap-0' } },
    dashboardSidebar: { slots: { root: 'border-e-0 bg-surface-app', header: 'h-12 px-3', body: 'px-2 py-1 gap-0', footer: 'px-2 py-2' } },
    dashboardToolbar: { slots: { root: 'border-muted min-h-10 px-4 sm:px-5' } },
    toast: { slots: { root: 'surface-raised ring-0 rounded-lg', title: 'text-sm', description: 'text-sm' } },
    empty: { slots: { title: 'text-sm font-medium', description: 'text-sm' } },
    formField: { slots: { label: 'text-sm font-medium text-toned', help: 'text-xs', hint: 'text-xs text-dimmed', description: 'text-xs' } },
  },
})
