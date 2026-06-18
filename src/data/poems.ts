export type Dynasty = string;

export type PoemForm = "五绝" | "七绝" | "五律" | "七律" | "自由";

export type Poet = {
  id: string;
  name: string;
  dynasty: Dynasty;
  bio: string;
  poemCount?: number;
  x: number;
  y: number;
  z: number;
};

export type Poem = {
  id: string;
  title: string;
  poetId: string;
  form: PoemForm;
  lines: string[];
  keywords: string[];
};

export const poets: Poet[] = [
  {
    id: "li-bai",
    name: "李白",
    dynasty: "唐",
    bio: "盛唐浪漫主义诗人，诗风飘逸奔放。",
    x: -3.2,
    y: 1.1,
    z: -1.4,
  },
  {
    id: "du-fu",
    name: "杜甫",
    dynasty: "唐",
    bio: "现实主义诗人，被后世称为诗圣。",
    x: -1.2,
    y: -0.8,
    z: 1.8,
  },
  {
    id: "wang-wei",
    name: "王维",
    dynasty: "唐",
    bio: "诗画兼擅，山水田园诗代表。",
    x: 1.9,
    y: 1.3,
    z: 0.2,
  },
  {
    id: "bai-juyi",
    name: "白居易",
    dynasty: "唐",
    bio: "倡导新乐府，语言平易近人。",
    x: 3.1,
    y: -1.2,
    z: -1.7,
  },
  {
    id: "su-shi",
    name: "苏轼",
    dynasty: "宋",
    bio: "北宋文学家，诗词文书画皆有开拓。",
    x: -0.4,
    y: 2.2,
    z: 2.5,
  },
  {
    id: "li-qingzhao",
    name: "李清照",
    dynasty: "宋",
    bio: "婉约词宗，作品兼具清丽与沉郁。",
    x: 2.4,
    y: 0.1,
    z: 2.7,
  },
  {
    id: "xin-qiji",
    name: "辛弃疾",
    dynasty: "宋",
    bio: "豪放派词人，词中多见家国气象。",
    x: -2.7,
    y: -2.1,
    z: 0.4,
  },
  {
    id: "ma-zhiyuan",
    name: "马致远",
    dynasty: "元",
    bio: "元曲大家，散曲格调苍凉高远。",
    x: 0.9,
    y: -2.5,
    z: -2.1,
  },
];

export const poems: Poem[] = [
  {
    id: "p-001",
    title: "静夜思",
    poetId: "li-bai",
    form: "五绝",
    lines: ["床前明月光", "疑是地上霜", "举头望明月", "低头思故乡"],
    keywords: ["月", "乡愁", "夜"],
  },
  {
    id: "p-002",
    title: "早发白帝城",
    poetId: "li-bai",
    form: "七绝",
    lines: ["朝辞白帝彩云间", "千里江陵一日还", "两岸猿声啼不住", "轻舟已过万重山"],
    keywords: ["江", "舟", "山"],
  },
  {
    id: "p-003",
    title: "望庐山瀑布",
    poetId: "li-bai",
    form: "七绝",
    lines: ["日照香炉生紫烟", "遥看瀑布挂前川", "飞流直下三千尺", "疑是银河落九天"],
    keywords: ["山水", "瀑布", "银河"],
  },
  {
    id: "p-004",
    title: "春望",
    poetId: "du-fu",
    form: "五律",
    lines: ["国破山河在", "城春草木深", "感时花溅泪", "恨别鸟惊心", "烽火连三月", "家书抵万金", "白头搔更短", "浑欲不胜簪"],
    keywords: ["家国", "战乱", "春"],
  },
  {
    id: "p-005",
    title: "登高",
    poetId: "du-fu",
    form: "七律",
    lines: ["风急天高猿啸哀", "渚清沙白鸟飞回", "无边落木萧萧下", "不尽长江滚滚来", "万里悲秋常作客", "百年多病独登台", "艰难苦恨繁霜鬓", "潦倒新停浊酒杯"],
    keywords: ["秋", "江", "登临"],
  },
  {
    id: "p-006",
    title: "鹿柴",
    poetId: "wang-wei",
    form: "五绝",
    lines: ["空山不见人", "但闻人语响", "返景入深林", "复照青苔上"],
    keywords: ["空山", "林", "静"],
  },
  {
    id: "p-007",
    title: "山居秋暝",
    poetId: "wang-wei",
    form: "五律",
    lines: ["空山新雨后", "天气晚来秋", "明月松间照", "清泉石上流", "竹喧归浣女", "莲动下渔舟", "随意春芳歇", "王孙自可留"],
    keywords: ["秋", "山居", "清泉"],
  },
  {
    id: "p-008",
    title: "赋得古原草送别",
    poetId: "bai-juyi",
    form: "五律",
    lines: ["离离原上草", "一岁一枯荣", "野火烧不尽", "春风吹又生", "远芳侵古道", "晴翠接荒城", "又送王孙去", "萋萋满别情"],
    keywords: ["草", "送别", "春"],
  },
  {
    id: "p-009",
    title: "题西林壁",
    poetId: "su-shi",
    form: "七绝",
    lines: ["横看成岭侧成峰", "远近高低各不同", "不识庐山真面目", "只缘身在此山中"],
    keywords: ["庐山", "哲理", "视角"],
  },
  {
    id: "p-010",
    title: "饮湖上初晴后雨",
    poetId: "su-shi",
    form: "七绝",
    lines: ["水光潋滟晴方好", "山色空蒙雨亦奇", "欲把西湖比西子", "淡妆浓抹总相宜"],
    keywords: ["西湖", "雨", "山水"],
  },
  {
    id: "p-011",
    title: "如梦令",
    poetId: "li-qingzhao",
    form: "自由",
    lines: ["常记溪亭日暮", "沉醉不知归路", "兴尽晚回舟", "误入藕花深处", "争渡", "争渡", "惊起一滩鸥鹭"],
    keywords: ["溪亭", "舟", "藕花"],
  },
  {
    id: "p-012",
    title: "清平乐·村居",
    poetId: "xin-qiji",
    form: "自由",
    lines: ["茅檐低小", "溪上青青草", "醉里吴音相媚好", "白发谁家翁媪"],
    keywords: ["村居", "溪", "田园"],
  },
  {
    id: "p-013",
    title: "天净沙·秋思",
    poetId: "ma-zhiyuan",
    form: "自由",
    lines: ["枯藤老树昏鸦", "小桥流水人家", "古道西风瘦马", "夕阳西下", "断肠人在天涯"],
    keywords: ["秋", "羁旅", "夕阳"],
  },
];

export const poemForms: PoemForm[] = ["五绝", "七绝", "五律", "七律", "自由"];
export const dynasties: Dynasty[] = ["唐", "宋", "元", "明", "清"];
