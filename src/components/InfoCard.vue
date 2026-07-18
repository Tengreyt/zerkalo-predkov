<script setup>
import { computed } from 'vue';
import { appState, currentCostumeId, toggleDescription } from '../store/appState.js';
import { getManifest } from '../core/assets.js';
import { descriptions } from '../config/descriptions.js';

// Разворот управляется и жестом ☝️, и кликом — состояние общее (в сторе).
const expanded = computed(() => appState.descriptionExpanded);
const card = computed(() => {
  const id = currentCostumeId();
  // Пересчёт при смене костюма в карусели
  void appState.costumeIndex;
  return {
    title: getManifest().costumes[id].title,
    short: descriptions[id]?.short ?? '',
    long: descriptions[id]?.long ?? '',
  };
});
</script>

<template>
  <div class="card" :class="{ expanded }" @click="toggleDescription">
    <h2>{{ card.title }}</h2>
    <p>{{ expanded && card.long ? card.long : card.short }}</p>
    <span v-if="card.long" class="more">{{ expanded ? '☝️ Свернуть' : '☝️ Подробнее' }}</span>
  </div>
</template>

<style scoped>
.card {
  background: rgba(12, 18, 13, 0.78);
  border: 1px solid rgba(214, 190, 140, 0.35);
  border-radius: 16px;
  padding: 22px 26px;
  color: #f3ecd9;
  cursor: pointer;
  backdrop-filter: blur(6px);
  transition: font-size 0.2s ease;
}
/* Развёрнутая карточка крупнее и шире — читается через весь экран. */
.card.expanded {
  font-size: 1.16em;
}
h2 {
  color: #d6be8c;
  font-size: 26px;
  margin-bottom: 10px;
}
p {
  font-size: 17px;
  line-height: 1.5;
}
.more {
  display: inline-block;
  margin-top: 10px;
  font-size: 14px;
  color: rgba(214, 190, 140, 0.8);
}
@media (max-width: 560px), (max-height: 650px) {
  .card { padding: 12px 14px; }
  h2 { font-size: 19px; margin-bottom: 5px; }
  p { font-size: 14px; line-height: 1.35; }
  .more { margin-top: 5px; font-size: 12px; }
}
</style>
