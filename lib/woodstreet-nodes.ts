// Woodstreet Space node definitions
// Space ID: a25657a2-981d-44b6-a2b5-a1eab4ac709b

export interface OutputOption {
  id: string;
  nodeId: string;
  label: string;
  labelEn: string;
  type: 'image' | 'video';
  cost: number;
  category: string;
  durations?: number[];
  aspectRatios?: string[];
}

export interface VideoParams {
  duration: number;
  aspectRatio: string;
}

export const OUTPUT_OPTIONS: OutputOption[] = [
  {
    id: 'white_bg_34',
    nodeId: '3aca2fcb-1b71-421b-9c85-c4f11a447602',
    label: 'صورة المنتج على خلفية بيضاء (زاوية 3/4)',
    labelEn: 'White Background — 3/4 Angle',
    type: 'image',
    cost: 1,
    category: 'product',
  },
  {
    id: 'white_bg_front',
    nodeId: 'f3514c2b-14f6-4476-9f84-e11f2012351b',
    label: 'صورة المنتج على خلفية بيضاء (أمامي)',
    labelEn: 'White Background — Front View',
    type: 'image',
    cost: 1,
    category: 'product',
  },
  {
    id: 'home_modern',
    nodeId: 'a03ceff9-e6d9-4d61-975d-8a6b4acf197c',
    label: 'صورة المنتج في منزل مصري مودرن',
    labelEn: 'Modern Egyptian Home',
    type: 'image',
    cost: 1,
    category: 'lifestyle',
  },
  {
    id: 'home_interior',
    nodeId: '08738244-187b-4572-9616-4661c1eb94c4',
    label: 'صورة المنتج في interior منزل مصري',
    labelEn: 'Egyptian Home Interior',
    type: 'image',
    cost: 1,
    category: 'lifestyle',
  },
  {
    id: 'home_livedin',
    nodeId: 'd53a1432-b28b-43ab-b1d4-a656f5e2ca62',
    label: 'صورة المنتج في منزل واقعي',
    labelEn: 'Lived-in Egyptian Home',
    type: 'image',
    cost: 1,
    category: 'lifestyle',
  },
  {
    id: 'image_dimensions',
    nodeId: '12d68131-926e-4e8b-a1e2-1ffc5635419b',
    label: 'صورة مع الأبعاد (Isometric)',
    labelEn: 'Isometric with Dimensions',
    type: 'image',
    cost: 1,
    category: 'product',
  },
  {
    id: 'video_orbital',
    nodeId: 'bbcae213-0b37-44cb-b824-337d54c94101',
    label: 'فيديو دوران 180 درجة',
    labelEn: '180° Orbital Video',
    type: 'video',
    cost: 7,
    category: 'video',
    durations: [5, 10],
    aspectRatios: ['1:1', '16:9', '9:16'],
  },
  {
    id: 'video_cinematic',
    nodeId: '1b98ba4e-6833-4e2e-868d-f73953abc9e6',
    label: 'فيديو عرض سينمائي',
    labelEn: 'Cinematic Showcase',
    type: 'video',
    cost: 7,
    category: 'video',
    durations: [5, 10],
    aspectRatios: ['1:1', '16:9', '9:16'],
  },
];

export const SPACE_ID = 'a25657a2-981d-44b6-a2b5-a1eab4ac709b';
export const INPUT_NODE_ID = 'cc6739fc-4f96-46a8-8db8-c730befb1c66';

export function getTotalCost(selectedIds: string[], videoParams?: Record<string, VideoParams>): number {
  return OUTPUT_OPTIONS
    .filter(o => selectedIds.includes(o.id))
    .reduce((sum, o) => {
      if (o.type === 'video' && videoParams?.[o.id]) {
        return sum + (videoParams[o.id].duration >= 10 ? 7 : 5);
      }
      return sum + o.cost;
    }, 0);
}

export function getNodeIds(selectedIds: string[]): string[] {
  return OUTPUT_OPTIONS
    .filter(o => selectedIds.includes(o.id))
    .map(o => o.nodeId);
}
