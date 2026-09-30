/** 探案舆图：地点标签与图上坐标。
 *  地点键来自 sceneSettings.ts 的 SCENE_SETTING（sceneId -> 地点键，勿手改那份），
 *  这里只补两件事：键的中文名，以及每部案件里各地点在图上摆哪儿。
 *  同地的昼/夜变体（street / street_night）在地图上算同一个点，故先折成基名。 */

/** 折掉时段后缀：street_night -> street。other 不参与折，它本来就是"他处" */
const TIME_SUFFIX = /_(night|dawn|dusk)$/;
export const locBase = (key: string): string => key.replace(TIME_SUFFIX, "");

export const LOC_LABEL: Record<string, string> = {
  camp: "军帐",
  council_hall: "公廨",
  field_road: "官道",
  mansion_yard: "宅院",
  palace_hall: "殿庭",
  prison: "牢狱",
  river: "河渡",
  street: "街市",
  study: "书房",
  tavern: "酒肆",
  village: "村落",
  wall_gate: "城门",
  boat_house: "船坞",
  other: "他处",
};

/** 五桩大理寺案件的舆图坐标（百分比，左上为原点）。
 *  只给"能到得了的地方"，pack_* / i_* 这类非地点幕不在图上。
 *  布局按明代府城的读法走：公廨居中偏北（问案的地方），街市在南，
 *  河渡沿右下水线排开，牢狱压在西北角——夜里提审走的是近路。 */
export const MAP_POS: Record<string, Record<string, [number, number]>> = {
  fuma: {
    council_hall: [50, 22], street: [30, 58], tavern: [70, 52],
    study: [18, 30], mansion_yard: [82, 26], palace_hall: [50, 78],
  },
  qiuwei: {
    council_hall: [48, 20], street: [26, 52], tavern: [74, 44],
    study: [16, 26], mansion_yard: [62, 74], prison: [30, 82],
  },
  sichou: {
    council_hall: [46, 24], street: [24, 50], study: [70, 34],
    palace_hall: [58, 68], prison: [20, 80], river: [80, 76], camp: [84, 16],
  },
  xie: {
    council_hall: [50, 24], street: [28, 56], tavern: [72, 50],
    study: [20, 28], palace_hall: [60, 78],
  },
  qinhuai: {
    council_hall: [44, 20], street: [22, 46], study: [68, 30],
    palace_hall: [52, 62], prison: [18, 76], tavern: [78, 54],
    river: [84, 80], boat_house: [62, 88],
  },
};

export const hasMap = (scenarioId: string): boolean => Boolean(MAP_POS[scenarioId]);
