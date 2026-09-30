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
 *  坐标是照着即梦产出的那张图一个个对出来的（图在 assets/maps/<剧本id>.jpg）：
 *  公廨压在衙署院、牢狱压在城根的窄院、酒肆挑在城外的酒旗处、
 *  河渡与船坞落在水面上——换底图必须重对一遍，别只换图不动坐标。 */
export const MAP_POS: Record<string, Record<string, [number, number]>> = {
  // 驸马案：城内一条大街南北贯通，衙署在街西重檐厅，酒楼是街东那座二层楼，船码头压在东南水沿
  fuma: {
    council_hall: [13, 47], palace_hall: [85, 42], street: [50, 63],
    tavern: [62, 44], mansion_yard: [31, 36], study: [24, 82],
  },
  // 秋纬案：方城四门，朱红殿在最北，高墙窄院是西南的牢城，酒肆在城外南下的幌子处
  qiuwei: {
    council_hall: [59, 32], prison: [27, 62], mansion_yard: [72, 40],
    street: [52, 52], tavern: [85, 82], study: [31, 40],
  },
  // 丝绸案：水乡，红门大院是殿庭，庙堂作公廨，晾绸架与桑林之间留书房，南边高墙方院是牢院
  sichou: {
    palace_hall: [55, 30], council_hall: [22, 22], study: [30, 33],
    street: [88, 52], river: [65, 60], prison: [43, 80], camp: [70, 15],
  },
  // 邪案：京畿军镇，帅旗中堂是公廨，三进院落当殿庭，校场边独立小院是书房，南关民市与角楼酒楼
  xie: {
    council_hall: [50, 42], palace_hall: [37, 53], study: [20, 27],
    street: [25, 72], tavern: [57, 70],
  },
  // 秦桧案：临安，宫殿区压在最北，御街直贯到水心洲，西面高墙窄院是牢城，东南江岸泊船处作船坞
  qinhuai: {
    palace_hall: [47, 20], council_hall: [36, 52], study: [30, 27],
    street: [46, 38], prison: [11, 57], tavern: [72, 35],
    river: [62, 70], boat_house: [80, 70],
  },
};

export const hasMap = (scenarioId: string): boolean => Boolean(MAP_POS[scenarioId]);
