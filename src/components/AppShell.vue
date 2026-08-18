<script setup>
import MobileHeader from './MobileHeader.vue'
import Sidebar from './Sidebar.vue'
import AddFeedModal from './AddFeedModal.vue'
import SettingsModal from './SettingsModal.vue'
</script>

<template>
  <div class="bg-transparent text-on-background font-body-md h-screen flex flex-col md:flex-row overflow-hidden">
    <div class="ambient-bg"></div>
    <MobileHeader />
    <Sidebar />
    <main
      id="main-scroll"
      class="flex-1 md:ml-64 pt-[calc(5rem+env(safe-area-inset-top))] md:pt-10 p-margin-mobile md:p-margin-desktop h-screen overflow-y-auto flex flex-col relative z-10"
    >
      <div class="max-w-content mx-auto w-full flex-1 flex flex-col">
        <slot />
      </div>
    </main>
    <AddFeedModal />
    <SettingsModal />
  </div>
</template>
