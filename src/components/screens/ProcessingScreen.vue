<template>
  <div class="screen processing-screen">
    <div class="develop">
      <div class="frame">
        <div class="wave" />
      </div>
      <p>Проявляем фотографию…</p>
    </div>
  </div>
</template>

<style scoped>
.processing-screen {
  background: #0c120d;
  display: flex;
  align-items: center;
  justify-content: center;
}
.develop {
  text-align: center;
  color: #d6be8c;
  font-size: 26px;
}
.frame {
  width: 220px;
  height: 300px;
  margin: 0 auto 28px;
  border: 3px solid rgba(214, 190, 140, 0.6);
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  background: rgba(214, 190, 140, 0.08);
}
.wave {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 0%, rgba(214, 190, 140, 0.45) 50%, transparent 100%);
  animation: develop 1s ease-in-out infinite;
}
@keyframes develop {
  from { transform: translateY(-100%); }
  to { transform: translateY(100%); }
}
</style>
