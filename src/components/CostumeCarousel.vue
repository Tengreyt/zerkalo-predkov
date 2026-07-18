<script setup>
import { computed } from 'vue';
import { appState, nextCostume, prevCostume } from '../store/appState.js';
import { getManifest } from '../core/assets.js';

const manifest = getManifest();
const items = computed(() =>
  appState.costumeIds.map((id, i) => ({
    id,
    title: manifest.costumes[id].title,
    active: i === appState.costumeIndex,
  })),
);

function select(index) {
  appState.costumeIndex = index;
}

</script>

<template>
  <div class="carousel">
    <button class="btn arrow" aria-label="Предыдущий костюм" @click="prevCostume">‹</button>
    <div class="items">
      <button
        v-for="(item, i) in items"
        :key="item.id"
        class="item"
        :class="{ active: item.active }"
        @click="select(i)"
      >
        {{ item.title }}
      </button>
    </div>
    <button class="btn arrow" aria-label="Следующий костюм" @click="nextCostume">›</button>
  </div>
</template>

<style scoped>
.carousel {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}
.arrow {
  font-size: 34px;
  padding: 6px 20px;
  flex-shrink: 0;
}
.items {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  scrollbar-width: none;
  min-width: 0;
  scroll-snap-type: x proximity;
}
.item {
  white-space: nowrap;
  padding: 12px 22px;
  border-radius: 999px;
  border: 2px solid rgba(214, 190, 140, 0.4);
  background: rgba(12, 18, 13, 0.6);
  color: #f3ecd9;
  font-size: 19px;
  cursor: pointer;
  transition: all 0.15s;
  scroll-snap-align: center;
}
.item.active {
  background: #d6be8c;
  color: #1d2a20;
  border-color: #d6be8c;
  font-weight: 600;
}
@media (max-width: 560px) {
  .carousel { gap: 6px; }
  .arrow { font-size: 26px; padding: 4px 12px; }
  .items { gap: 6px; }
  .item { padding: 9px 13px; font-size: 14px; }
}
</style>
