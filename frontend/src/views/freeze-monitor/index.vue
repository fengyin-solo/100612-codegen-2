<template>
  <FreezingWorkbench
    title="冻结监测与开挖登记台（第二入口）"
    :desc="
      '本页与「联络通道工序台账」读取同一份数据：测温登记、进尺/二衬闸门、隐患清单两边完全一致，' +
      '同一孔同一时刻重复测温只留一条，同一条单据重复递交只记一次。'
    "
  />
</template>

<script setup lang="ts">
import FreezingWorkbench from '@/features/freezing/index.vue'
</script>
