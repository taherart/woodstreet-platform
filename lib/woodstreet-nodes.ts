// Woodstreet Space node definitions
// Space ID: a25657a2-981d-44b6-a2b5-a1eab4ac709b

export const OUTPUT_OPTIONS = [
  {
    id: 'white_bg_34',
    nodeId: '3aca2fcb-1b71-421b-9c85-c4f11a447602',
    label: 'صورة المنتج على خلفية بيضاء (زاوية 3/4)',
    labelEn: 'White Background — 3/4 Angle',
    type: 'image' as const,
    cost: 75,
    category: 'product',
  },
  {
    id: 'white_bg_front',
    nodeId: 'f3514c2b-14f6-4476-9f84-e11f2012351b',
    label: 'صورة المنتج على خلفية بيضاء (أمامي)',
    labelEn: 'White Background — Front View',
    type: 'image' as const,
    cost: 75,
    category: 'product',
  },
  {
    id: 'home_modern',
    nodeId: 'a03ceff9-e6d9-4d61-975d-8a6b4acf197c',
    label: 'صورة المنتج في منزل مصري مودرن',
    labelEn: 'Modern Egyptian Home',
    type: 'image' as const,
    cost: 75,
    category: 'lifestyle',
  },
  {
    id: 'home_interior',
    nodeId: '08738244-187b-4572-9616-4661c1eb94c4',
    label: 'صورة المنتج في interior منزل مصري',
    labelEn: 'Egyptian Home Interior',
    type: 'image' as const,
    cost: 75,
    category: 'lifestyle',
  },
  {
    id: 'home_livedin',
    nodeId: 'd53a1432-b28b-43ab-b1d4-a656f5e2ca62',
    label: 'صورة المنتج في منزل واقعي',
    labelEn: 'Lived-in Egyptian Home',
    type: 'image' as const,
    cost: 75,
    category: 'lifestyle',
  },
  {
    id: 'video_orbital',
    nodeId: 'bbcae213-0b37-44cb-b824-337d54c94101',
    label: 'فيديو دوران 180 درجة — 10 ثواني',
    labelEn: '180° Orbital Video — 10s',
    type: 'video' as const,
    cost: 200,
    category: 'video',
  },
  {
    id: 'video_cinematic',
    nodeId: '1b98ba4e-6833-4e2e-868d-f73953abc9e6',
    label: 'فيديو عرض سينمائي — 5 ثواني',
    labelEn: 'Cinematic Showcase — 5s',
    type: 'video' as const,
    cost: 150,
    category: 'video',
  },
];

export const SPACE_ID = 'a25657a2-981d-44b6-a2b5-a1eab4ac709b';
export const INPUT_NODE_ID = 'cc6739fc-4f96-46a8-8db8-c730befb1c66';

export function getTotalCost(selectedIds: string[]): number {
  return OUTPUT_OPTIONS
    .filter(o => selectedIds.includes(o.id))
    .reduce((sum, o) => sum + o.cost, 0);
}

export function getNodeIds(selectedIds: string[]): string[] {
  return OUTPUT_OPTIONS
    .filter(o => selectedIds.includes(o.id))
    .map(o => o.nodeId);
}
