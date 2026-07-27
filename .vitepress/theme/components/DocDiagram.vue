<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

/**
 * Inlines a hand-authored diagram from `theme/diagrams/`.
 *
 * The SVG is injected into the page rather than loaded through `<img>` for two
 * reasons: the page stylesheet can then drive its palette, so diagrams follow
 * the light/dark toggle, and each diagram carries both language variants in
 * `data-i18n` groups that the `data-lang` attribute selects here.
 */
const props = defineProps<{ name: string; alt?: string }>()

const { lang } = useData()

const sources = import.meta.glob('../diagrams/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const svg = computed(() => sources[`../diagrams/${props.name}.svg`] ?? '')
const dgLang = computed(() => (lang.value.startsWith('ja') ? 'ja' : 'en'))
</script>

<template>
  <figure class="doc-diagram" :data-lang="dgLang" role="img" :aria-label="alt" v-html="svg" />
</template>
