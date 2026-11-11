/* N06 原型示范数据
 * 海南地点名称、位置与图片路径来自仓库现有资产与现有数据集；
 * 中文/英文长介绍、问题、节日日期与记录均为“原型示范 / 待核实”，不是生产内容。
 *
 * 图片来源口径（2026-11-09 修复）：
 * - PHOTO_MANIFEST.csv 记录与地点不符、或来源/许可无法确认的归档图，登在 photoExclusions 里，
 *   不再计入 photos，也不进入单文件；原图仍在仓库，未删除、未改名。
 * - 其余图片只表示“有 PHOTO_MANIFEST.csv 记录”，未逐张重开来源页核验，
 *   状态为待核实，不得表述为已确认真实对应。
 * - 聊天、人物建议、作品分类样本均为固定静态演示，不调用云端 AI，不按用户输入实时生成。
 */
(function () {
  const places = [
    {
      id: 3, cityFolder: 'Haikou', cnName: '骑楼老街', enName: 'Qilou Old Street', city: '海口', category: '城市街拍',
      locationCn: '海口市龙华区中山路一带，靠近海口钟楼', locationEn: 'Zhongshan Road, Longhua District, near Haikou Clock Tower',
      photos: [1, 2, 3], declaredPhotos: 3,
      introCn: '骑楼老街在海口龙华区中山路一带，靠近钟楼。两排南洋风格的骑楼把走廊连成一条长长的阴影带，下午走进去很凉快。抬头能看到旧式窗框和斑驳墙面，转角就是海南粉、清补凉和小吃摊。带朋友来，不用赶景点，慢慢走、拍几张街景，再找家老店坐下就好。',
      introEn: 'This is the old arcade street near Haikou Clock Tower. Two rows of Southeast Asian-style shophouses form a long, shaded walkway that stays cool in the afternoon. Look up at the old window frames and weathered walls, then stop for Hainanese noodles, sweet dessert soup, or a small snack. It is not a single sightseeing spot; the pleasure is walking slowly, taking a few street photos, and sitting down in an old shop with a friend.',
      questions: [
        { cn: '你所在的城市也有这种带走廊的老街吗？', en: 'Do old streets in your city have covered walkways like this?' },
        { cn: '如果只能选一种，你想先尝海南粉还是清补凉？', en: 'If you could try only one, would you start with Hainanese noodles or the sweet dessert?' }
      ],
      note: '介绍为原型示范改写，开放店铺与营业状态待内容智能体核实。',
      records: [
        {
          id: 'rec-qilou-1', title: '第一次带朋友走骑楼', date: '2026-11-08',
          expressions: [
            { cn: '这条街很适合慢慢走。', en: 'This street is great for a slow walk.' },
            { cn: '抬头看这些老窗户。', en: 'Look up at these old windows.' },
            { cn: '我们要不要找家店坐一下？', en: 'Shall we find a shop and sit for a while?' },
            { cn: '这里的建筑有点像东南亚。', en: 'The buildings here feel a bit Southeast Asian.' }
          ],
          cn: '下午四点从钟楼那边走进来，阳光被骑楼挡住，走廊里很凉快。朋友一直在拍窗户和招牌，我们就顺着中山路慢慢走。后来在一家小店点了清补凉，坐着看外面的人来人往。没有赶景点，反而聊得最久。',
          en: 'We walked in from the clock tower side at four in the afternoon. The arcade kept the walkway cool, and my friend kept photographing the windows and signs. We followed Zhongshan Road slowly, then sat down at a small shop for sweet dessert soup and watched people pass by. We did not rush to any sights, and that slow hour ended up being the best part of the day.',
          history: [{ v: 'v1', date: '2026-11-08', note: '首次记录（原型示范）' }]
        },
        {
          id: 'rec-qilou-2', title: '傍晚再走一次', date: '2026-11-09',
          expressions: [
            { cn: '晚上灯亮起来更好看。', en: 'It looks even better when the lights come on.' },
            { cn: '人比下午少一点。', en: 'It is a little quieter than in the afternoon.' },
            { cn: '下次可以带他去吃海南粉。', en: 'Next time I can take him for Hainanese noodles.' }
          ],
          cn: '傍晚又去了一次，店铺的灯亮起来，墙面颜色比白天暖。人没有下午那么多，我们走得更慢。朋友说想试试本地的粉，我就记下了下次要去的店。',
          en: 'I went back in the evening when the shop lights were on and the walls looked warmer than in daylight. There were fewer people, so we walked even more slowly. My friend said he wanted to try local noodles, so I made a note of the shop to visit next time.',
          history: [{ v: 'v1', date: '2026-11-09', note: '原型示范记录' }]
        },
        {
          id: 'rec-qilou-legacy', title: '旧格式记录', date: '2026-10-20', legacy: true,
          expressions: [
            { cn: '这里晚上比白天热闹。', en: 'It is busier here in the evening than in the day.' },
            { cn: '我们边走边看店。', en: 'We walked along and looked at the shops.' }
          ],
          cn: '十月那次是傍晚来的，街上的灯一盏一盏亮起来。我们没定路线，走到哪算哪，看到喜欢的店就进去。',
          en: 'We came in the evening that time in October, and the street lights came on one by one. We had no fixed route; we simply walked until something caught our eye.',
          enVariants: [
            { en: 'We came in the evening and the street lights were coming on one after another.', note: '旧英文 B 版本 · 默认隐藏，仅历史兼容' }
          ],
          sourceSpan: { start: 0, end: 46, note: '旧版语音原文片段（已不再作为正式正文）' },
          practiceLog: [
            { date: '2026-10-21', result: '说出 1 种自然英文表达，判定通过' },
            { date: '2026-10-22', result: '复述整段中文，英文只作参考' }
          ],
          history: [
            { v: 'v1', date: '2026-10-20', note: '旧格式导入（recordId / sourceSpan 沿用）' },
            { v: 'v2', date: '2026-10-22', note: '新增练习日志；英文 B 版本保留但隐藏' }
          ]
        }
      ]
    },
    {
      id: 4, cityFolder: 'Haikou', cnName: '云洞图书馆', enName: 'Cloud Cave Library', city: '海口', category: '城市街拍',
      locationCn: '海口市龙华区世纪广场路1号，海口湾海边', locationEn: 'No. 1 Century Square Road, Longhua District, beside Haikou Bay',
      photos: [1, 2, 3], declaredPhotos: 3,
      introCn: '云洞图书馆在海口湾边的世纪广场路，白色曲面建筑像一块被海风磨圆的石头。最出片的是那些弧形门洞，站远一点，可以把建筑、海面和天空放进同一张照片。傍晚光线变软，很多人来等日落。进馆阅读通常需要预约，规则会调整，出发前最好再确认。',
      introEn: 'This white, curving building sits right beside Haikou Bay. Its rounded openings frame the sea like natural windows, which is why people come at sunset with a camera. Walk around the outside first, then find the angle where the building, water, and sky line up. Going inside to read usually requires a booking, and the rules can change, so check before you go.',
      questions: [
        { cn: '你更喜欢看建筑外观，还是进去安静坐一会儿？', en: 'Would you rather look at the building from outside or sit quietly inside?' },
        { cn: '日落时你会先拍照还是先看海？', en: 'At sunset, do you take photos first or just watch the sea?' }
      ],
      note: '预约与开放规则未核实，原型不展示确定结论。',
      records: [
        {
          id: 'rec-yundong-1', title: '等日落的一个小时', date: '2026-11-06',
          expressions: [
            { cn: '这个门洞像画框。', en: 'This opening works like a picture frame.' },
            { cn: '太阳还要一会儿才落。', en: 'The sun will take a while to set.' },
            { cn: '我们先沿着海边走一圈。', en: 'Let us walk along the bay first.' }
          ],
          cn: '傍晚到的时候光线还很亮，我们先沿着海边走了一圈。朋友一直研究怎么把门洞、海面和天空放进同一张照片。等太阳低下来，风也凉了，我们才坐下来。没有进馆，只在外面看光影变化。',
          en: 'When we arrived in the late afternoon, the light was still bright, so we walked along the bay first. My friend kept working out how to fit the opening, the sea, and the sky into one photo. We sat down only when the sun was low and the wind had cooled. We did not go inside; the changing light outside was enough.',
          history: [{ v: 'v1', date: '2026-11-06', note: '原型示范记录' }]
        }
      ]
    },
    {
      id: 9, cityFolder: 'Haikou', cnName: '雷琼火山口地质公园', enName: 'Leiqiong Crater Geopark', city: '海口', category: '城市街拍',
      locationCn: '海口市秀英区石山镇，靠近火山口公园景区入口', locationEn: 'Shishan Town, Xiuying District, near the geopark entrance',
      photos: [1, 2, 3], declaredPhotos: 3,
      introCn: '雷琼火山口地质公园在海口秀英区石山镇，是城市西边一片很古老的火山地貌。沿着步道往火山口走，两边是黑色的火山岩和长得很有劲的植物，和海边完全是另一种海南。这里适合慢慢走、看看岩石纹理，也适合给朋友解释“海南不只有沙滩”。开放时间和游览路线以景区现场公告为准。',
      introEn: 'This geopark in Shishan Town shows a much older side of Hainan. A walking path leads toward an ancient crater, with dark volcanic rock and tough green plants on both sides. It feels completely different from the coast, and it is a good place to explain that Hainan is not only beaches. Take your time, look closely at the rock textures, and check the opening hours and route at the site.',
      questions: [
        { cn: '你家乡附近有火山或很特别的地形吗？', en: 'Is there a volcano or unusual landscape near your hometown?' },
        { cn: '你徒步时更喜欢看风景还是听讲解？', en: 'When you hike, do you prefer looking at the view or learning the facts?' }
      ],
      note: '开放时间、门票与路线均未核实，原型不展示确定结论。',
      records: []
    },
    {
      id: 43, cityFolder: 'Haikou', cnName: '假日海滩', enName: 'Holiday Beach', city: '海口', category: '海滨日落',
      locationCn: '海口市秀英区滨海大道西段的假日海滩', locationEn: 'Holiday Beach, western Binhai Avenue, Xiuying District',
      photos: [1, 2, 3], declaredPhotos: 3,
      introCn: '假日海滩在海口秀英区滨海大道西段，是一条很日常的城市海岸。椰子树、沙滩和海风都在，傍晚很多人来散步、跑步或者坐着看落日。这里的海水条件和三亚的度假海湾不一样，适合休闲看海，不要默认哪里都能安全下水。带朋友来，买点喝的，找个位置吹风聊天就很舒服。',
      introEn: 'Holiday Beach is a relaxed city coastline on western Binhai Avenue. Coconut palms, sand, and sea breeze are all here, and locals come in the evening to walk, run, or sit and watch the sunset. The swimming conditions are not the same as at a resort beach in Sanya, so enjoy the view rather than assuming it is safe to swim everywhere. Bring a drink, find a spot, and just talk.',
      questions: [
        { cn: '你家乡的海边平时大家会去做什么？', en: 'What do people usually do by the sea where you are from?' },
        { cn: '你更喜欢清晨的海还是傍晚的海？', en: 'Do you prefer the sea in the morning or in the evening?' }
      ],
      note: '是否可下水、救生设施情况待核实；原型只建议休闲看海。',
      records: []
    },
    {
      id: 62, cityFolder: 'Wenchang', cnName: '石头公园', enName: 'Stone Park', city: '文昌', category: '海南环岛',
      locationCn: '文昌市龙楼镇铜鼓岭附近的石头公园海岸', locationEn: 'Stone Park coast near Tongguling, Longlou Town, Wenchang',
      photos: [], declaredPhotos: 3,
      photoExclusions: [
        { slot: 1, path: 'Wenchang/062/01.webp', source: 'https://commons.wikimedia.org/wiki/File:Stone_Park,_Ashland_MA.jpg', reason: '清单记录为美国马萨诸塞州 Stone Park（John Phelan），不是文昌石头公园' },
        { slot: 2, path: 'Wenchang/062/02.webp', source: 'https://commons.wikimedia.org/wiki/File:Jeju_Stone_Park_14.jpg', reason: '清单记录为韩国济州 Stone Park（Bernard Gagnon），不是文昌石头公园' },
        { slot: 3, path: 'Wenchang/062/03.webp', source: 'https://commons.wikimedia.org/wiki/File:Latte_Stones_in_Latte_Stone_Park,_Guam.jpg', reason: '清单记录为关岛 Latte Stone Park（Lance Vanlewen），不是文昌石头公园' }
      ],
      introCn: '石头公园在文昌龙楼镇铜鼓岭附近，海岸上不是细沙，而是一大片被海浪冲刷过的巨石。石头形状很粗犷，浪打上来时特别有气势，适合拍风景，也能让朋友看到海南不一样的海岸。岩石湿滑，靠近浪区要小心，风浪大时不要勉强走到边上。',
      introEn: 'Stone Park is a dramatic coastline near Tongguling in Wenchang. Instead of soft sand, you walk among huge rocks shaped by waves, with surf crashing against them. It is a great place for landscape photos and for showing a friend a rougher side of Hainan. The rocks can be slippery, so keep away from the edge when the waves are strong.',
      questions: [
        { cn: '你更喜欢细沙滩还是这种岩石海岸？', en: 'Do you prefer a soft sandy beach or a rocky coast like this?' },
        { cn: '你拍照时会为了一个好角度走很远吗？', en: 'Would you walk far for a good photo angle?' }
      ],
      note: '现有归档 3 张全部与地点不符（美国 Stone Park、韩国济州、关岛），已从展示中排除；本页无可用照片，待重新采集。',
      records: []
    },
    {
      id: 63, cityFolder: 'Wenchang', cnName: '东郊椰林', enName: 'Dongjiao Coconut Grove', city: '文昌', category: '海南环岛',
      locationCn: '文昌市东郊镇东郊椰林海岸', locationEn: 'Dongjiao Coconut Grove, Dongjiao Town, Wenchang',
      photos: [1, 2, 3], declaredPhotos: 3,
      introCn: '东郊椰林在文昌东郊镇的海边，椰子树长得特别密，很多小路一抬头就是层层椰叶，走几分钟又能看到海。这里没有太多复杂的玩法，最适合慢慢走、在树荫下停下来喝个椰子，让朋友感受最典型的海南热带海岛画面。蚊虫和日晒都要注意，傍晚会舒服一些。',
      introEn: 'Dongjiao Coconut Grove is exactly what the name suggests: dense coconut palms growing beside the sea. On many small paths you look up into layers of palm leaves, then walk a few minutes and reach the water. There is not much to do here, which is the point. Slow down, drink a fresh coconut in the shade, and let your friend feel the classic tropical side of Hainan.',
      questions: [
        { cn: '你见过椰子从树上长出来的样子吗？', en: 'Have you ever seen coconuts growing on a tree?' },
        { cn: '旅行时你喜欢安排活动还是留时间随便走？', en: 'When you travel, do you like planned activities or time to wander?' }
      ],
      note: '椰林内消费与蚊虫情况为体验提醒，具体店家和价格待核实。',
      records: []
    },
    {
      id: 71, cityFolder: 'Qionghai', cnName: '潭门渔港', enName: 'Tanmen Fishing Port', city: '琼海', category: '海南环岛',
      locationCn: '琼海市潭门镇潭门渔港', locationEn: 'Tanmen Fishing Port, Tanmen Town, Qionghai',
      photos: [], declaredPhotos: 3,
      photoExclusions: [
        { slot: 1, path: 'Qionghai/071/01.webp', source: 'https://commons.wikimedia.org/wiki/File:Tan-men_noodle_(46539335051).jpg', reason: '清单记录为日本坦面（Tan-men noodle），不是潭门渔港' },
        { slot: 2, path: 'Qionghai/071/02.webp', source: 'https://commons.wikimedia.org/wiki/File:Tanmen_Yamitsuki_20190121.jpg', reason: '清单记录为名古屋的日式坦面店（円周率３パーセント），不是潭门渔港' },
        { slot: 3, path: 'Qionghai/071/03.webp', source: 'https://commons.wikimedia.org/wiki/File:Gifu_Tanmen_Age_Tanmen_20190306.jpg', reason: '清单记录为岐阜坦面（円周率３パーセント），不是潭门渔港' }
      ],
      introCn: '潭门渔港在琼海潭门镇，是一个真正在运转的渔港，不是专门搭给游客看的布景。码头上能看到渔船、渔具和刚上岸的渔货，附近还有海鲜店和小市场。带朋友来，重点不是打卡，而是看本地人怎么工作、怎么生活。拍照前先问一声，别挡着人家干活。',
      introEn: 'Tanmen is a working fishing port, not a staged tourist village. You can see fishing boats, nets, and the catch coming in, with seafood shops and a small market nearby. The interesting part is watching how local people actually work and live, so treat it as their workplace rather than a photo set. Ask before taking close-up photos, and keep out of the way.',
      questions: [
        { cn: '你家乡有靠海吃饭的港口或市场吗？', en: 'Does your hometown have a port or market that depends on the sea?' },
        { cn: '你会想早起去看渔船回港吗？', en: 'Would you wake up early to watch the boats come in?' }
      ],
      note: '现有归档 3 张均为日式坦面图片（与“Tanmen”同名误配），已排除；本页无可用照片，待重新采集。渔船回港与市场时间仍待核实。',
      records: []
    },
    {
      id: 78, cityFolder: 'Wanning', cnName: '日月湾', enName: 'Riyue Bay', city: '万宁', category: '海南环岛',
      locationCn: '万宁市礼纪镇日月湾，海南东线海岸', locationEn: 'Riyue Bay, Liji Town, Wanning, east coast of Hainan',
      photos: [1, 2, 3], declaredPhotos: 3,
      introCn: '日月湾在万宁礼纪镇，是海南很有名的冲浪海湾。海边能看到浪板、冲浪店和咖啡馆，年轻人很多，气氛比度假酒店区更松弛。不会冲浪也没关系，可以找正规教练上体验课，或者坐在岸边看别人追浪。下水前要听教练和救生员的安排，浪况不好时不要硬来。',
      introEn: 'Riyue Bay in Wanning is one of Hainan\'s best-known surf spots. You will see boards, surf schools, and beach cafes, with a younger and more casual atmosphere than the resort areas. Beginners can take a lesson with a qualified instructor, or simply sit on the sand and watch. Follow the instructor and lifeguard advice, and do not go in when the surf is too strong.',
      questions: [
        { cn: '你试过冲浪或者别的水上运动吗？', en: 'Have you tried surfing or any other water sport?' },
        { cn: '你旅行时更愿意学新东西还是彻底放松？', en: 'When you travel, do you prefer learning something new or completely relaxing?' }
      ],
      note: '冲浪店、课程价格与救生配置待核实；原型不推荐具体商家。',
      records: []
    },
    {
      id: 88, cityFolder: 'Lingshui', cnName: '分界洲岛', enName: 'Fenjiezhou Island', city: '陵水', category: '海南环岛',
      locationCn: '陵水黎族自治县牛岭附近的分界洲岛景区', locationEn: 'Fenjiezhou Island, near Niuling, Lingshui',
      photos: [1, 2, 3], declaredPhotos: 3,
      introCn: '分界洲岛在陵水牛岭附近，需要坐景区船过去。这里的海水通常很清，很多人是冲着潜水和海上项目来的。岛上除了玩水，也能沿着步道看看礁石和海景。出海和项目运营会受天气影响，船班、开放区域和水上活动安排都要以景区当天公告为准，风浪大时不要勉强。',
      introEn: 'Fenjiezhou Island lies off the coast near Niuling in Lingshui, and you reach it by the official ferry. The water is often clear, and most people come for diving or other marine activities. You can also walk along the paths and look at the rocks and sea views. Boat schedules and water activities depend on the weather, so check the day\'s official notice and do not force it when the sea is rough.',
      questions: [
        { cn: '你对潜水感兴趣吗，还是会有点紧张？', en: 'Are you interested in diving, or would you feel nervous?' },
        { cn: '遇到天气不好，你会改计划还是等一等？', en: 'If the weather turns bad, do you change plans or wait it out?' }
      ],
      note: '船班、潜水运营与价格均待核实；原型不展示确定性承诺。',
      records: []
    },
    {
      id: 97, cityFolder: 'Sanya', cnName: '西岛', enName: 'West Island', city: '三亚', category: '海南环岛',
      locationCn: '三亚市天涯区西岛景区，乘船从码头上岛', locationEn: 'West Island, Tianya District, Sanya, reached by ferry',
      photos: [2, 3], declaredPhotos: 3,
      photoExclusions: [
        { slot: 1, path: 'Sanya/097/01.webp', source: 'https://commons.wikimedia.org/wiki/File:West_Island_(South_Australia).JPG', reason: '清单记录为澳大利亚南澳 West Island（Danimations），不是三亚西岛' }
      ],
      introCn: '西岛在三亚天涯区，从码头坐船上岛。它不只是海滩景区，岛上还有真正的渔村、窄巷和居民生活。可以步行或租车慢慢逛，看看老房子、墙上的涂鸦和晾晒的渔具，再找家小店吃海鲜。带朋友来，别只停在沙滩，往村子里走一走，会看到更真实的岛居日常。',
      introEn: 'West Island is reached by ferry from Sanya\'s Tianya District. It is more than a beach stop: there is a real fishing village with narrow lanes and everyday island life. Walk or rent a small vehicle, look at the old houses, wall paintings, and fishing gear, then find a local place for seafood. Encourage your friend to leave the beach and walk into the village.',
      questions: [
        { cn: '你去海岛时更喜欢住酒店还是逛当地村子？', en: 'On an island, do you prefer resort time or exploring local villages?' },
        { cn: '你会想在海岛上住一晚吗？', en: 'Would you want to stay overnight on an island?' }
      ],
      note: '第 1 张为澳大利亚南澳 West Island，已排除；第 2、3 张仅有清单记录（来源为三亚西岛码头），未重开来源页核验，按待核实展示。船班、租车与店铺信息待核实。',
      records: []
    },
    {
      id: 99, cityFolder: 'Sanya', cnName: '亚龙湾', enName: 'Yalong Bay', city: '三亚', category: '海南环岛',
      locationCn: '三亚市吉阳区亚龙湾海岸', locationEn: 'Yalong Bay coast, Jiyang District, Sanya',
      photos: [1, 2, 3], declaredPhotos: 3,
      photoCaveats: {
        3: '清单标题为“三亚废弃酒店 1999”，与亚龙湾海滩主题不完全一致；因来源地点仍在三亚，本轮不排除，标待核实'
      },
      introCn: '亚龙湾在三亚吉阳区，是三亚很经典的度假海湾，沙滩细，沿海一排酒店和椰林。这里最适合住一两晚，白天在沙滩走走、下午游泳或休息，傍晚再看海，而不是匆匆拍一张照片就走。酒店和公共海滩的开放范围、设施使用规则不一样，进门之前先问清楚。',
      introEn: 'Yalong Bay is Sanya\'s classic resort beach: fine sand, palm trees, and a long line of hotels along the coast. It works best as a one- or two-night stay, with time on the beach, a swim or a rest in the afternoon, and a slow evening by the water. Hotel beaches and public areas have different access rules, so ask before you walk in.',
      questions: [
        { cn: '你度假时会安排满行程还是大部分时间待在海边？', en: 'On holiday, do you plan a full schedule or spend most of the time by the sea?' },
        { cn: '你更喜欢热闹的海滩还是安静的海滩？', en: 'Do you prefer a lively beach or a quiet one?' }
      ],
      note: '酒店与公共海滩权限待核实；原型不承诺设施可用。',
      records: []
    },
    {
      id: 115, cityFolder: 'Other_Hainan', cnName: '儋州峨蔓火山海岸', enName: 'Eman Volcanic Coast', city: '其他地区', category: '海南环岛',
      locationCn: '儋州市峨蔓镇峨蔓火山海岸一带', locationEn: 'Volcanic coast around Eman Town, Danzhou',
      photos: [], declaredPhotos: 3,
      photoExclusions: [
        { slot: 1, path: 'Other_Hainan/115/01.webp', source: 'https://commons.wikimedia.org/wiki/File:Eman_Košpo_25072026_(3).jpg', reason: '清单记录为足球运动员 Eman Košpo 热身照（Timmy96），不是儋州海岸' },
        { slot: 2, path: 'Other_Hainan/115/02.webp', source: 'https://commons.wikimedia.org/wiki/File:YT1D0492_-_Eman_Kellam.jpg', reason: '清单记录为人物 Eman Kellam（PlanetSketchy），不是儋州海岸' },
        { slot: 3, path: 'Other_Hainan/115/03.webp', source: 'https://commons.wikimedia.org/wiki/File:Eman_bei_Bodafors.jpg', reason: '清单记录为瑞典 Emån 河（Olaf Meister），不是儋州海岸' }
      ],
      introCn: '峨蔓火山海岸在儋州峨蔓镇一带，黑色火山岩沿着海岸铺开，形状很野，和三亚的白沙滩完全是两种画面。这里适合喜欢地质、海岸地貌和安静风景的人，沿途有些路段比较偏，通行和安全条件要先确认。不要爬湿滑的礁石，也不要独自走到没有人的海边。',
      introEn: 'The Eman volcanic coast in Danzhou is a wild stretch of black rock rather than white sand. It is a fascinating place for geology, coastal scenery, and quiet walks, but some sections are remote, so check access and safety before setting out. Avoid slippery rocks and do not wander alone to an empty part of the coast. Bring water and keep an eye on the tide.',
      questions: [
        { cn: '你见过黑色的火山海岸吗？', en: 'Have you ever seen a black volcanic coast?' },
        { cn: '你旅行时会为了特别的地貌绕路吗？', en: 'Would you take a detour for an unusual landscape?' }
      ],
      note: '现有归档 3 张均与地点无关（人物照与瑞典河流，因“Eman”同名误配），已排除；本页无可用照片，待重新采集。部分路段通行条件待核实。',
      records: []
    },
    {
      id: 1, cityFolder: 'Haikou', cnName: '龙兴路', enName: 'Longxing Road', city: '海口', category: '城市街拍',
      locationCn: '海口市龙华区国贸片区的龙兴路', locationEn: 'Longxing Road, Guomao area, Longhua District, Haikou',
      photos: [], declaredPhotos: 3,
      photoExclusions: [
        { slot: 1, path: 'Haikou/001/01.webp', source: '', reason: 'PHOTO_MANIFEST.csv 无此文件记录，来源与许可均未登记，无法确认是否龙兴路' }
      ],
      introCn: '龙兴路在海口龙华区国贸片区，是一条不到五百米的小街，最近因为街拍火了起来。咖啡馆门头、绿植、外摆桌椅和复古小店都很上镜，下午光线好的时候随便走走就能出片。这里更适合边逛边喝点东西，不要把它当成一个必须打卡的大景点。',
      introEn: 'Longxing Road is a short street in Haikou\'s Guomao area that has become popular for street photography. Cafe fronts, plants, outdoor tables, and small vintage shops make it easy to take good photos, especially in the afternoon light. Treat it as a place to wander and have a drink rather than a major sightseeing stop. Some shops change often, so check before you go.',
      questions: [
        { cn: '你逛街时喜欢拍店门口还是拍人？', en: 'When you walk around a city, do you photograph shopfronts or people?' },
        { cn: '你会在旅行中专程去找一条小街吗？', en: 'Would you seek out a small street like this when you travel?' }
      ],
      note: '现有归档仅 1 张，且未在 PHOTO_MANIFEST.csv 登记来源与许可，已排除；3 个槽位全部按待核实/缺图展示，不用其他地点图片冒充。',
      records: []
    }
  ];

  const F = (id, cn, en, region, theme, dateRule, y2026, y2027, status, briefCn, briefEn, questions) => ({
    id, cn, en, region, theme, dateRule, y2026, y2027, status, briefCn, briefEn, questions,
    source: '来源待补：官方/可靠日历，原型不当作已核实'
  });

  const festivals = [
  {
    "id": "spring-festival",
    "cn": "春节",
    "en": "Chinese New Year",
    "country_region": "中国",
    "theme": "家庭",
    "date_rule": "农历正月初一（待确认）",
    "dates_2026_2027": [
      "2026-02-17",
      "2027-02-06"
    ],
    "status": "pending",
    "holiday_type": "public_holiday",
    "cn_brief": "中国最重要的家庭节日之一。常见元素是团圆饭、红包和走亲访友，但每个家庭的具体过法差别很大。",
    "en_brief": "One of the most important family holidays in China. Reunion meals, red envelopes, and visiting relatives are common, but every family does it differently.",
    "questions": [
      {
        "cn": "你家里过年最看重的是一顿饭还是团聚本身？",
        "en": "At New Year, is the meal or the time together more important in your family?"
      },
      {
        "cn": "你们有发红包或交换小礼物的习惯吗？",
        "en": "Do you have a tradition of giving red envelopes or small gifts?"
      }
    ],
    "related_place_ids": [
      3,
      43
    ],
    "source_urls": [
      "https://date.nager.at/api/v3/PublicHolidays/2026/CN",
      "https://date.nager.at/api/v3/PublicHolidays/2027/CN"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "lantern",
    "cn": "元宵节",
    "en": "Lantern Festival",
    "country_region": "中国",
    "theme": "家庭",
    "date_rule": "农历正月十五（待确认）",
    "dates_2026_2027": [
      "2026-03-03",
      "2027-02-20"
    ],
    "status": "pending",
    "holiday_type": "festival_day",
    "cn_brief": "农历新年的收尾，常见看花灯、猜灯谜和吃汤圆。城市里的活动规模差别很大。",
    "en_brief": "The close of the Lunar New Year period, often marked with lanterns, riddles, and sweet rice balls. Public events vary a lot by city.",
    "questions": [
      {
        "cn": "你见过猜灯谜或放花灯吗？",
        "en": "Have you ever seen lantern riddles or floating lanterns?"
      },
      {
        "cn": "你更喜欢甜馅还是咸馅的汤圆？",
        "en": "Do you prefer sweet or savoury rice balls?"
      }
    ],
    "related_place_ids": [
      3,
      1
    ],
    "source_urls": [
      "https://date.nager.at/api/v3/PublicHolidays/2026/CN"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "qingming",
    "cn": "清明节",
    "en": "Qingming Festival",
    "country_region": "中国",
    "theme": "纪念",
    "date_rule": "公历 4 月 4–5 日前后（待确认）",
    "dates_2026_2027": [
      "2026-04-05",
      "2027-04-05"
    ],
    "status": "pending",
    "holiday_type": "festival_day",
    "cn_brief": "扫墓和踏青的日子，既有纪念先人的部分，也有春天出门走走的意味。问的时候要留出空间，不必追问细节。",
    "en_brief": "A day for visiting family graves and for spring outings. It carries both remembrance and a sense of going outdoors; leave room for the other person not to share details.",
    "questions": [
      {
        "cn": "你们那里春天有固定的踏青习惯吗？",
        "en": "Is there a spring outing tradition where you are from?"
      },
      {
        "cn": "你会和家人一起做清明相关的安排吗？",
        "en": "Do you usually spend this time with family?"
      }
    ],
    "related_place_ids": [
      9,
      115
    ],
    "source_urls": [],
    "verified_at": "2026-11-09"
  },
  {
    "id": "dragon-boat",
    "cn": "端午节",
    "en": "Dragon Boat Festival",
    "country_region": "中国",
    "theme": "饮食",
    "date_rule": "农历五月初五（待确认）",
    "dates_2026_2027": [
      "2026-06-19",
      "2027-06-09"
    ],
    "status": "pending",
    "holiday_type": "festival_day",
    "cn_brief": "常见元素是粽子、赛龙舟和门口挂艾草。不同地区的粽子和活动差别很大。",
    "en_brief": "Common elements are zongzi, dragon-boat races, and hanging herbs by the door. The food and events differ a lot between regions.",
    "questions": [
      {
        "cn": "你吃过粽子吗？甜的还是咸的？",
        "en": "Have you ever tried zongzi? Sweet or savoury?"
      },
      {
        "cn": "你现场看过龙舟比赛吗？",
        "en": "Have you ever watched a dragon-boat race in person?"
      }
    ],
    "related_place_ids": [
      71,
      88
    ],
    "source_urls": [
      "https://date.nager.at/api/v3/PublicHolidays/2026/CN",
      "https://date.nager.at/api/v3/PublicHolidays/2027/CN"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "qixi",
    "cn": "七夕",
    "en": "Qixi Festival",
    "country_region": "中国",
    "theme": "爱情",
    "date_rule": "农历七月初七（2026/2027 公历日期待确认）",
    "dates_2026_2027": [
      null,
      null
    ],
    "status": "pending",
    "holiday_type": "festival_day",
    "cn_brief": "七夕来自牛郎织女的故事，常被称作中国的情人节。有人约会送礼，也有人只把它当作普通日子，问的时候不要默认。",
    "en_brief": "Qixi comes from the Cowherd and Weaver Girl legend and is often called Chinese Valentine's Day. Some people go on dates or give gifts, while others treat it as an ordinary day, so do not assume.",
    "questions": [
      {
        "cn": "你们有关于星星或传说的节日吗？",
        "en": "Does your culture have a festival linked to stars or a legend?"
      },
      {
        "cn": "你会为这类节日特意安排约会吗？",
        "en": "Would you plan a date for a festival like this?"
      }
    ],
    "related_place_ids": [
      78,
      4
    ],
    "source_urls": [
      "https://en.wikipedia.org/wiki/Qixi_Festival"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "mid-autumn",
    "cn": "中秋节",
    "en": "Mid-Autumn Festival",
    "country_region": "中国",
    "theme": "家庭",
    "date_rule": "农历八月十五（待确认）",
    "dates_2026_2027": [
      "2026-09-25",
      "2027-09-15"
    ],
    "status": "pending",
    "holiday_type": "festival_day",
    "cn_brief": "看月亮、吃月饼和一家人聚在一起的日子。月饼口味很多，送礼习惯也各不相同。",
    "en_brief": "A time for moon watching, mooncakes, and family gatherings. Mooncake flavours and gifting habits vary widely.",
    "questions": [
      {
        "cn": "你家里中秋会一起吃饭吗？",
        "en": "Does your family have a meal together at Mid-Autumn?"
      },
      {
        "cn": "你更喜欢传统月饼还是新口味？",
        "en": "Do you prefer traditional mooncakes or newer flavours?"
      }
    ],
    "related_place_ids": [
      99,
      43
    ],
    "source_urls": [
      "https://date.nager.at/api/v3/PublicHolidays/2026/CN",
      "https://date.nager.at/api/v3/PublicHolidays/2027/CN"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "chongyang",
    "cn": "重阳节",
    "en": "Double Ninth Festival",
    "country_region": "中国",
    "theme": "敬老",
    "date_rule": "农历九月初九（待确认）",
    "dates_2026_2027": [
      "2026-10-18",
      "2027-10-08"
    ],
    "status": "pending",
    "holiday_type": "festival_day",
    "cn_brief": "重阳在农历九月初九，传统上登高、赏菊，也被视为敬老的日子。各地做法不同，有人把它过成家庭日。",
    "en_brief": "Double Ninth falls on the ninth day of the ninth lunar month. Climbing hills and admiring chrysanthemums are traditional, and it is also treated as a day to respect older people. Practice varies.",
    "questions": [
      {
        "cn": "你们有专门看望长辈的日子吗？",
        "en": "Is there a day when people especially visit older relatives?"
      },
      {
        "cn": "你最近一次陪长辈出门是什么时候？",
        "en": "When did you last go out with an older relative?"
      }
    ],
    "related_place_ids": [
      9,
      115
    ],
    "source_urls": [
      "https://en.wikipedia.org/wiki/Double_Ninth_Festival"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "national-day",
    "cn": "国庆节",
    "en": "National Day",
    "country_region": "中国",
    "theme": "假期",
    "date_rule": "固定公历 10 月 1 日；连休与调休上班日按当年国务院办公厅通知",
    "dates_2026_2027": [
      "2026-10-01",
      "2027-10-01"
    ],
    "status": "fixed",
    "holiday_type": "public_holiday",
    "cn_brief": "10 月 1 日是节日本日，具体连休与调休上班日（makeup workday）每年由官方通知确定。很多人会出行或回家。",
    "en_brief": "1 October is the festival day itself; the actual days off and any make-up workdays are set by the official notice each year. Many people travel or go home.",
    "questions": [
      {
        "cn": "长假你会出行还是留在家里？",
        "en": "On a long holiday, do you travel or stay home?"
      },
      {
        "cn": "你更喜欢错峰出门还是和大家一起放假？",
        "en": "Do you prefer travelling off-peak or taking the same holiday as everyone else?"
      }
    ],
    "related_place_ids": [
      99,
      43,
      97
    ],
    "source_urls": [
      "https://date.nager.at/api/v3/PublicHolidays/2026/CN",
      "https://date.nager.at/api/v3/PublicHolidays/2027/CN"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "hainan-junpo",
    "cn": "军坡节（公期）",
    "en": "Junpo Festival (Gongqi)",
    "country_region": "中国·海南",
    "theme": "民俗",
    "date_rule": "农历二月，各村择日举行（具体日期待确认）",
    "dates_2026_2027": [
      null,
      null
    ],
    "status": "pending",
    "holiday_type": "festival_day",
    "cn_brief": "海南各地村镇的军坡节也叫公期，以祭祀、游神、舞狮和宴客为主。不同村落日期与做法差别很大，外来者要尊重当地安排。",
    "en_brief": "Junpo, also called Gongqi, is a village temple festival in Hainan with processions, lion dance, and shared meals. Dates and customs differ from village to village, so visitors should follow local arrangements respectfully.",
    "questions": [
      {
        "cn": "你们家乡有以村镇为单位的庙会吗？",
        "en": "Does your hometown have a village-level temple fair like this?"
      },
      {
        "cn": "参加别人的地方祭祀时，你会先问什么规矩？",
        "en": "When you join a local ceremony, what rules do you ask about first?"
      }
    ],
    "related_place_ids": [
      71,
      3
    ],
    "source_urls": [],
    "verified_at": "2026-11-09"
  },
  {
    "id": "hainan-huanhua",
    "cn": "海南换花节",
    "en": "Hainan Flower Exchange Festival",
    "country_region": "中国·海南",
    "theme": "民俗",
    "date_rule": "农历正月十五前后（与元宵同期，活动日期待确认）",
    "dates_2026_2027": [
      "2026-03-03",
      "2027-02-20"
    ],
    "status": "pending",
    "holiday_type": "festival_day",
    "cn_brief": "海口府城的换花节在元宵前后举行，人们以换花代替旧俗，互道祝福，也有花灯与游园。具体活动日期每年以当地公告为准。",
    "en_brief": "The Flower Exchange Festival in Fucheng, Haikou, takes place around the Lantern Festival. People exchange flowers as a blessing and join lantern and park events. Exact dates follow local announcements each year.",
    "questions": [
      {
        "cn": "你们那里元宵会用花或灯表达祝福吗？",
        "en": "Where you are from, do people use flowers or lanterns to give blessings at the Lantern Festival?"
      },
      {
        "cn": "如果能换到一枝花，你会送给谁？",
        "en": "If you could exchange for one flower, who would you give it to?"
      }
    ],
    "related_place_ids": [
      3,
      1
    ],
    "source_urls": [
      "https://date.nager.at/api/v3/PublicHolidays/2026/CN"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "hainan-sanyuesan",
    "cn": "三月三（黎族苗族）",
    "en": "Sanyuesan Festival",
    "country_region": "中国·海南",
    "theme": "民族",
    "date_rule": "农历三月初三（2026/2027 公历日期待确认）",
    "dates_2026_2027": [
      null,
      null
    ],
    "status": "pending",
    "holiday_type": "festival_day",
    "cn_brief": "三月三是海南黎族、苗族的传统节日，常见对歌、竹竿舞、传统服饰和长桌宴。不同市县与村寨安排不同，参与前先了解当地习俗。",
    "en_brief": "Sanyuesan is a traditional festival for the Li and Miao peoples of Hainan, often marked with antiphonal singing, bamboo dance, traditional dress, and long-table meals. Arrangements differ by county and village, so learn the local customs first.",
    "questions": [
      {
        "cn": "你们有以对歌或舞蹈为主的节日吗？",
        "en": "Does your culture have a festival built around singing or dance?"
      },
      {
        "cn": "参加民族节日时，你最想先了解什么？",
        "en": "At a cultural festival, what would you want to understand first?"
      }
    ],
    "related_place_ids": [
      88,
      78
    ],
    "source_urls": [],
    "verified_at": "2026-11-09"
  },
  {
    "id": "hainan-carnival",
    "cn": "海南国际旅游岛欢乐节",
    "en": "Hainan International Tourism Island Carnival",
    "country_region": "中国·海南",
    "theme": "文旅",
    "date_rule": "通常在年末举办，具体时间与主会场按当年公告",
    "dates_2026_2027": [
      null,
      null
    ],
    "status": "pending",
    "holiday_type": "festival_day",
    "cn_brief": "海南国际旅游岛欢乐节通常在年末举办，全省多地有演出、美食与市集。举办时间和主会场每年由主办方公布，出发前先查当年安排。",
    "en_brief": "The Hainan International Tourism Island Carnival is usually held near the end of the year, with performances, food, and markets across the province. Dates and main venues are announced each year, so check before you go.",
    "questions": [
      {
        "cn": "你们有全城或全省联动的节庆吗？",
        "en": "Does your region have a festival across many cities?"
      },
      {
        "cn": "节庆里你更喜欢美食还是演出？",
        "en": "At a festival, do you prefer the food or the performances?"
      }
    ],
    "related_place_ids": [
      99,
      43
    ],
    "source_urls": [],
    "verified_at": "2026-11-09"
  },
  {
    "id": "st-patrick",
    "cn": "圣帕特里克节",
    "en": "St Patrick's Day",
    "country_region": "爱尔兰",
    "theme": "文化",
    "date_rule": "固定公历 3 月 17 日",
    "dates_2026_2027": [
      "2026-03-17",
      "2027-03-17"
    ],
    "status": "fixed",
    "holiday_type": "public_holiday",
    "cn_brief": "爱尔兰的国庆日，海外爱尔兰社群也常举行游行和音乐活动。不是所有爱尔兰人都会庆祝，问的时候不要默认。",
    "en_brief": "Ireland's national day, also marked by parades and music in Irish communities abroad. Not every Irish person celebrates it, so do not assume.",
    "questions": [
      {
        "cn": "你们那里这天会有游行或音乐活动吗？",
        "en": "Are there parades or music events where you are from?"
      },
      {
        "cn": "你更喜欢参加大型活动还是和朋友小聚？",
        "en": "Would you rather join a big event or meet a few friends?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [
      "https://date.nager.at/api/v3/PublicHolidays/2026/IE",
      "https://date.nager.at/api/v3/PublicHolidays/2027/IE"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "bonfire",
    "cn": "篝火之夜",
    "en": "Bonfire Night",
    "country_region": "英国",
    "theme": "文化",
    "date_rule": "固定公历 11 月 5 日",
    "dates_2026_2027": [
      "2026-11-05",
      "2027-11-05"
    ],
    "status": "fixed",
    "holiday_type": "festival_day",
    "cn_brief": "英国部分地区用烟花和篝火纪念历史事件。不是全英每个家庭都会过，城市活动规模也不同。",
    "en_brief": "Fireworks and bonfires mark a historical event in parts of the UK. Not every family celebrates, and city events vary in size.",
    "questions": [
      {
        "cn": "你那里十一月会有烟花活动吗？",
        "en": "Are there firework events in November where you are from?"
      },
      {
        "cn": "你喜欢看烟花还是觉得太吵？",
        "en": "Do you enjoy fireworks or find them too noisy?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [
      "https://date.nager.at/api/v3/PublicHolidays/2026/GB",
      "https://date.nager.at/api/v3/PublicHolidays/2027/GB"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "boxing-day",
    "cn": "节礼日",
    "en": "Boxing Day",
    "country_region": "英国",
    "theme": "家庭",
    "date_rule": "固定公历 12 月 26 日；若落在周末，法定补休顺延",
    "dates_2026_2027": [
      "2026-12-26",
      "2027-12-26"
    ],
    "status": "fixed",
    "holiday_type": "public_holiday",
    "cn_brief": "节礼日是圣诞节次日，英国与部分英联邦地区放假。常见安排是家庭聚餐、走亲访友或看体育比赛；若落在周末，法定补休会顺延。",
    "en_brief": "Boxing Day falls the day after Christmas and is a public holiday in the UK and parts of the Commonwealth. Family meals, visits, and sport are common; when it lands on a weekend, the statutory day off moves.",
    "questions": [
      {
        "cn": "你们圣诞节后还有一天专门休息吗？",
        "en": "Do you have a second day off right after Christmas?"
      },
      {
        "cn": "节日里你更愿意出门还是待在家？",
        "en": "During the holidays, would you rather go out or stay in?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [
      "https://date.nager.at/api/v3/PublicHolidays/2026/GB",
      "https://date.nager.at/api/v3/PublicHolidays/2027/GB"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "easter-sunday",
    "cn": "复活节",
    "en": "Easter Sunday",
    "country_region": "英国",
    "theme": "宗教",
    "date_rule": "春分后首个满月之后的星期日（日期待确认）",
    "dates_2026_2027": [
      "2026-04-05",
      "2027-03-28"
    ],
    "status": "pending",
    "holiday_type": "observance",
    "cn_brief": "复活节日期按春分后首个满月后的星期日计算，每年不同。英国当天多有家庭聚餐，但法定假日通常是耶稣受难日与复活节星期一。",
    "en_brief": "Easter Sunday is dated by the first Sunday after the first full moon following the spring equinox, so it moves each year. In the UK it is often a family day, while the bank holidays fall on Good Friday and Easter Monday.",
    "questions": [
      {
        "cn": "你们家复活节会聚餐还是去教堂？",
        "en": "Does your family have a meal or go to church at Easter?"
      },
      {
        "cn": "你喜欢有固定日期的节日还是每年变动的？",
        "en": "Do you prefer holidays with a fixed date or ones that move each year?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [
      "https://date.nager.at/api/v3/PublicHolidays/2026/GB",
      "https://date.nager.at/api/v3/PublicHolidays/2027/GB"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "st-andrews-day",
    "cn": "圣安德鲁日",
    "en": "St Andrew's Day",
    "country_region": "英国·苏格兰",
    "theme": "文化",
    "date_rule": "固定公历 11 月 30 日",
    "dates_2026_2027": [
      "2026-11-30",
      "2027-11-30"
    ],
    "status": "fixed",
    "holiday_type": "public_holiday",
    "cn_brief": "圣安德鲁日是苏格兰的国庆日，11 月 30 日。苏格兰有银行假日，但并非所有单位都休息，活动以本地社区和音乐为主。",
    "en_brief": "St Andrew's Day on 30 November marks Scotland's national day. It is a bank holiday in Scotland, though not every workplace closes; local events often focus on community and music.",
    "questions": [
      {
        "cn": "你们有地区性的国庆日吗？",
        "en": "Does your region have its own national day?"
      },
      {
        "cn": "这一天你们会穿传统服饰吗？",
        "en": "Do people wear traditional clothes on this day?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [
      "https://date.nager.at/api/v3/PublicHolidays/2026/GB",
      "https://date.nager.at/api/v3/PublicHolidays/2027/GB"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "remembrance-day",
    "cn": "阵亡将士纪念日",
    "en": "Remembrance Day",
    "country_region": "英国",
    "theme": "纪念",
    "date_rule": "固定公历 11 月 11 日",
    "dates_2026_2027": [
      "2026-11-11",
      "2027-11-11"
    ],
    "status": "fixed",
    "holiday_type": "observance",
    "cn_brief": "英国的阵亡将士纪念日在 11 月 11 日，常见佩戴红色虞美人花和默哀。它更接近纪念日而非放假节日，问的时候要留出空间。",
    "en_brief": "Remembrance Day in the UK is on 11 November, often marked with red poppies and a two-minute silence. It is a commemoration rather than a day off, so leave room for people who may not wish to talk.",
    "questions": [
      {
        "cn": "你们有佩戴某种标志纪念的日子吗？",
        "en": "Is there a day when people wear a symbol to remember?"
      },
      {
        "cn": "遇到这类纪念日，你会主动聊起吗？",
        "en": "On days like this, would you bring it up in conversation?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [
      "https://date.nager.at/api/v3/PublicHolidays/2026/GB",
      "https://date.nager.at/api/v3/PublicHolidays/2027/GB"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "thanksgiving",
    "cn": "感恩节",
    "en": "Thanksgiving",
    "country_region": "美国",
    "theme": "家庭",
    "date_rule": "美国 11 月第四个星期四（计算值，待复核）",
    "dates_2026_2027": [
      "2026-11-26",
      "2027-11-25"
    ],
    "status": "pending",
    "holiday_type": "public_holiday",
    "cn_brief": "美国家庭聚餐和表达感谢的日子，常和火鸡、南瓜派联系在一起。加拿大感恩节在 10 月，日期不同。",
    "en_brief": "A US family meal and a day for giving thanks, often linked to turkey and pumpkin pie. Canada's Thanksgiving is in October and follows a different date.",
    "questions": [
      {
        "cn": "你们家有固定聚餐的节日吗？",
        "en": "Does your family have a fixed holiday for a big meal?"
      },
      {
        "cn": "你会在这天给谁发消息说谢谢？",
        "en": "Is there someone you would message to say thank you?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [
      "https://date.nager.at/api/v3/PublicHolidays/2026/US"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "halloween",
    "cn": "万圣节",
    "en": "Halloween",
    "country_region": "美国",
    "theme": "文化",
    "date_rule": "固定公历 10 月 31 日",
    "dates_2026_2027": [
      "2026-10-31",
      "2027-10-31"
    ],
    "status": "fixed",
    "holiday_type": "observance",
    "cn_brief": "打扮、南瓜灯和要糖果的夜晚，在美国和部分英国地区更常见。成年人怎么过差别很大。",
    "en_brief": "A night of costumes, pumpkins, and trick-or-treating, more common in the US and parts of the UK. How adults mark it varies a lot.",
    "questions": [
      {
        "cn": "你小时候会去要糖果吗？",
        "en": "Did you go trick-or-treating as a child?"
      },
      {
        "cn": "你现在还会为万圣节打扮吗？",
        "en": "Do you still dress up for Halloween?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [],
    "source_note": "公历固定日期；来源待补",
    "verified_at": "2026-11-09"
  },
  {
    "id": "independence-day",
    "cn": "美国独立日",
    "en": "Independence Day",
    "country_region": "美国",
    "theme": "国家",
    "date_rule": "固定公历 7 月 4 日",
    "dates_2026_2027": [
      "2026-07-04",
      "2027-07-04"
    ],
    "status": "fixed",
    "holiday_type": "public_holiday",
    "cn_brief": "美国独立日在 7 月 4 日。常见烟花、烧烤和家庭聚会，也有人只当作夏日假期。不是每个家庭都会大办。",
    "en_brief": "US Independence Day on 4 July is often marked with fireworks, barbecues, and family gatherings, though some people simply enjoy a summer day off. Not every household celebrates in a big way.",
    "questions": [
      {
        "cn": "你们国庆会放烟花吗？",
        "en": "Do people set off fireworks on your national day?"
      },
      {
        "cn": "你会参加社区活动还是和家人待在一起？",
        "en": "Do you join community events or stay with family?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [
      "https://date.nager.at/api/v3/PublicHolidays/2026/US"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "mlk-day",
    "cn": "马丁·路德·金纪念日",
    "en": "Martin Luther King Jr. Day",
    "country_region": "美国",
    "theme": "纪念",
    "date_rule": "1 月第三个星期一（计算值，待复核）",
    "dates_2026_2027": [
      "2026-01-19",
      "2027-01-18"
    ],
    "status": "pending",
    "holiday_type": "public_holiday",
    "cn_brief": "美国纪念马丁·路德·金的联邦假日，定在 1 月第三个星期一。学校与机构常有纪念活动，也有人把它当作长周末。",
    "en_brief": "Martin Luther King Jr. Day is a US federal holiday on the third Monday of January. Schools and organisations often hold commemorations, while others treat it as a long weekend.",
    "questions": [
      {
        "cn": "你们有专门纪念某位人物的公共假日吗？",
        "en": "Does your country have a public holiday honouring a particular person?"
      },
      {
        "cn": "这样的日子你更愿意参加活动还是安静度过？",
        "en": "On a day like this, would you join events or keep it quiet?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [
      "https://date.nager.at/api/v3/PublicHolidays/2026/US"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "memorial-day",
    "cn": "美国阵亡将士纪念日",
    "en": "Memorial Day",
    "country_region": "美国",
    "theme": "纪念",
    "date_rule": "5 月最后一个星期一（计算值，待复核）",
    "dates_2026_2027": [
      "2026-05-25",
      "2027-05-31"
    ],
    "status": "pending",
    "holiday_type": "public_holiday",
    "cn_brief": "美国阵亡将士纪念日在 5 月最后一个星期一，常被视为夏季开始。有人扫墓纪念，也有人去海边或烧烤。",
    "en_brief": "US Memorial Day falls on the last Monday of May and often marks the start of summer. Some people visit graves and honour the fallen, while others head to the beach or a barbecue.",
    "questions": [
      {
        "cn": "你们有纪念阵亡者的日子吗？",
        "en": "Does your country have a day to remember the fallen?"
      },
      {
        "cn": "这个周末你更想去海边还是待在家？",
        "en": "On this long weekend, would you rather go to the coast or stay home?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [
      "https://date.nager.at/api/v3/PublicHolidays/2026/US"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "juneteenth",
    "cn": "六月节",
    "en": "Juneteenth",
    "country_region": "美国",
    "theme": "纪念",
    "date_rule": "固定公历 6 月 19 日",
    "dates_2026_2027": [
      "2026-06-19",
      "2027-06-19"
    ],
    "status": "fixed",
    "holiday_type": "public_holiday",
    "cn_brief": "美国六月节在 6 月 19 日，纪念奴隶制结束。近年成为联邦假日，各地有游行、音乐和家庭聚会，参与程度不一。",
    "en_brief": "Juneteenth on 19 June marks the end of slavery in the US. It became a federal holiday recently, with parades, music, and family gatherings in many places, though participation varies.",
    "questions": [
      {
        "cn": "你们有纪念历史转折的节日吗？",
        "en": "Does your country have a holiday marking a turning point in history?"
      },
      {
        "cn": "你会通过什么方式了解这段历史？",
        "en": "How do you usually learn about history like this?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [
      "https://date.nager.at/api/v3/PublicHolidays/2026/US"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "shichi-go-san",
    "cn": "七五三",
    "en": "Shichi-Go-San",
    "country_region": "日本",
    "theme": "家庭",
    "date_rule": "固定公历 11 月 15 日（地区习俗待确认）",
    "dates_2026_2027": [
      "2026-11-15",
      "2027-11-15"
    ],
    "status": "pending",
    "holiday_type": "festival_day",
    "cn_brief": "日本为三岁、五岁、七岁孩子祈福的日子，常见穿传统服装去神社。家庭做法差别很大。",
    "en_brief": "A Japanese day for children aged three, five, and seven, often marked with traditional clothes and a shrine visit. Family practice varies.",
    "questions": [
      {
        "cn": "你们小时候有类似的成长仪式吗？",
        "en": "Did you have a coming-of-age ceremony as a child?"
      },
      {
        "cn": "你家里会保留小时候的照片吗？",
        "en": "Does your family keep childhood photos?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [],
    "verified_at": "2026-11-09"
  },
  {
    "id": "japan-childrens-day",
    "cn": "儿童节（こどもの日）",
    "en": "Children's Day",
    "country_region": "日本",
    "theme": "家庭",
    "date_rule": "固定公历 5 月 5 日",
    "dates_2026_2027": [
      "2026-05-05",
      "2027-05-05"
    ],
    "status": "fixed",
    "holiday_type": "public_holiday",
    "cn_brief": "日本儿童节在 5 月 5 日，是国定假日。常见挂鲤鱼旗、摆盔甲装饰，祝愿孩子健康长大；家庭做法差别很大。",
    "en_brief": "Japan's Children's Day on 5 May is a national holiday. Families often hang carp streamers and display samurai helmets to wish children good health, though family practice and decorations differ.",
    "questions": [
      {
        "cn": "你们有专门为孩子设的节日吗？",
        "en": "Does your country have a holiday just for children?"
      },
      {
        "cn": "你小时候家里会为节日做什么装饰？",
        "en": "Did your family decorate for festivals when you were a child?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [
      "https://date.nager.at/api/v3/PublicHolidays/2026/JP",
      "https://date.nager.at/api/v3/PublicHolidays/2027/JP"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "japan-culture-day",
    "cn": "文化日",
    "en": "Culture Day",
    "country_region": "日本",
    "theme": "文化",
    "date_rule": "固定公历 11 月 3 日",
    "dates_2026_2027": [
      "2026-11-03",
      "2027-11-03"
    ],
    "status": "fixed",
    "holiday_type": "public_holiday",
    "cn_brief": "日本文化日在 11 月 3 日，是国定假日。常见展览、演出与文化活动，部分博物馆免费开放，学校也会举办作品展。",
    "en_brief": "Culture Day in Japan falls on 3 November as a national holiday. Exhibitions, performances, and cultural events are common, some museums open free, and schools may hold displays of student work.",
    "questions": [
      {
        "cn": "你们有专门展示文化的节日吗？",
        "en": "Does your country have a day to showcase culture?"
      },
      {
        "cn": "你会去看展览还是待在家里？",
        "en": "Would you visit an exhibition or stay home?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [
      "https://date.nager.at/api/v3/PublicHolidays/2026/JP",
      "https://date.nager.at/api/v3/PublicHolidays/2027/JP"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "japan-obon",
    "cn": "盂兰盆节",
    "en": "Obon",
    "country_region": "日本",
    "theme": "家庭",
    "date_rule": "8 月 13–16 日前后（非国定假日，地区日期不同，待确认）",
    "dates_2026_2027": [
      "2026-08-13",
      "2027-08-13"
    ],
    "status": "pending",
    "holiday_type": "observance",
    "cn_brief": "日本的盂兰盆节在 8 月中旬，不是国定假日，各地日期不同。常见返乡扫墓与家庭聚会，类似中国的清明与团聚。",
    "en_brief": "Obon in Japan falls in mid-August. It is not a national holiday and dates differ by region; many people return home, visit family graves, and gather with relatives for meals.",
    "questions": [
      {
        "cn": "你们有必须回老家扫墓的时节吗？",
        "en": "Is there a season when people go home to visit family graves?"
      },
      {
        "cn": "长途回家对你来说是负担还是期待？",
        "en": "Is travelling home for this something you look forward to or find tiring?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [],
    "verified_at": "2026-11-09"
  },
  {
    "id": "chuseok",
    "cn": "秋夕",
    "en": "Chuseok",
    "country_region": "韩国",
    "theme": "家庭",
    "date_rule": "农历八月十五（待确认）",
    "dates_2026_2027": [
      "2026-09-25",
      "2027-09-15"
    ],
    "status": "pending",
    "holiday_type": "public_holiday",
    "cn_brief": "韩国的秋收与家庭节日，常与返乡、祭祖和分享食物有关。交通和家庭安排差别很大。",
    "en_brief": "A Korean harvest and family holiday, often linked to travelling home, remembrance, and sharing food. Travel and family arrangements vary.",
    "questions": [
      {
        "cn": "你们有必须回老家的节日吗？",
        "en": "Is there a holiday when you are expected to go back home?"
      },
      {
        "cn": "节日食物里你最期待哪一道？",
        "en": "Which festival food do you look forward to most?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [
      "https://date.nager.at/api/v3/PublicHolidays/2026/KR",
      "https://date.nager.at/api/v3/PublicHolidays/2027/KR"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "seollal",
    "cn": "春节（설날）",
    "en": "Seollal",
    "country_region": "韩国",
    "theme": "家庭",
    "date_rule": "农历正月初一（待确认；官方假期通常含前后各一天）",
    "dates_2026_2027": [
      "2026-02-17",
      "2027-02-06"
    ],
    "status": "pending",
    "holiday_type": "public_holiday",
    "cn_brief": "韩国的春节称설날，农历正月初一，通常连休前后各一天。常见返乡、祭祖和吃年糕汤，交通会很拥挤。",
    "en_brief": "Seollal is the Korean Lunar New Year on the first day of the first lunar month, usually with a three-day break. People travel home, honour ancestors, and eat rice-cake soup; roads get busy.",
    "questions": [
      {
        "cn": "你们过年也会返乡吗？",
        "en": "Do people travel home for the new year where you are from?"
      },
      {
        "cn": "过年必吃的一道菜是什么？",
        "en": "What dish is a must at your new year?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [
      "https://date.nager.at/api/v3/PublicHolidays/2026/KR",
      "https://date.nager.at/api/v3/PublicHolidays/2027/KR"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "hangul-day",
    "cn": "韩文节",
    "en": "Hangul Day",
    "country_region": "韩国",
    "theme": "文化",
    "date_rule": "固定公历 10 月 9 日",
    "dates_2026_2027": [
      "2026-10-09",
      "2027-10-09"
    ],
    "status": "fixed",
    "holiday_type": "public_holiday",
    "cn_brief": "韩文节在 10 月 9 日，纪念韩文字母的创制，是国定假日。学校与机构会有相关活动，也有人只当作休息日。",
    "en_brief": "Hangul Day on 9 October marks the creation of the Korean alphabet and is a national holiday. Schools and organisations hold events, though some people simply enjoy the day off.",
    "questions": [
      {
        "cn": "你们的文字有专门的纪念日吗？",
        "en": "Does your writing system have its own day?"
      },
      {
        "cn": "你觉得学一门新文字最难的是什么？",
        "en": "What is the hardest part of learning a new script for you?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [
      "https://date.nager.at/api/v3/PublicHolidays/2026/KR",
      "https://date.nager.at/api/v3/PublicHolidays/2027/KR"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "songkran",
    "cn": "宋干节",
    "en": "Songkran",
    "country_region": "泰国",
    "theme": "新年",
    "date_rule": "公历 4 月 13–15 日前后（待确认）",
    "dates_2026_2027": [
      "2026-04-13",
      "2027-04-13"
    ],
    "status": "pending",
    "holiday_type": "public_holiday",
    "cn_brief": "泰国的新年节日，常见泼水、去寺庙和家庭团聚。各地活动与放假安排不同。",
    "en_brief": "The Thai New Year, commonly associated with water pouring, temple visits, and family time. Local events and public holidays differ by region.",
    "questions": [
      {
        "cn": "你经历过泼水节吗？",
        "en": "Have you ever experienced Songkran?"
      },
      {
        "cn": "你们新年会先去寺庙还是先和家人吃饭？",
        "en": "At New Year, do you visit a temple first or have a family meal first?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [],
    "verified_at": "2026-11-09"
  },
  {
    "id": "loy-krathong",
    "cn": "水灯节",
    "en": "Loy Krathong",
    "country_region": "泰国",
    "theme": "文化",
    "date_rule": "泰历十二月满月（待确认）",
    "dates_2026_2027": [
      "2026-11-24",
      "2027-11-13"
    ],
    "status": "pending",
    "holiday_type": "festival_day",
    "cn_brief": "泰国水灯节在泰历十二月满月，公历多在 11 月。人们把装饰过的水灯放入河中许愿，清迈同期还有天灯活动。",
    "en_brief": "Loy Krathong falls on the full moon of the twelfth Thai month, usually in November. People float decorated baskets on rivers to make wishes, and Chiang Mai adds sky lanterns at the same time.",
    "questions": [
      {
        "cn": "你放过水灯或天灯吗？",
        "en": "Have you ever floated a water lantern or sky lantern?"
      },
      {
        "cn": "如果许一个愿，你会许什么？",
        "en": "If you made one wish, what would it be?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [
      "https://en.wikipedia.org/wiki/Loy_Krathong"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "visakha-bucha",
    "cn": "卫塞节",
    "en": "Visakha Bucha",
    "country_region": "泰国",
    "theme": "宗教",
    "date_rule": "泰历六月满月（2026/2027 公历日期待确认）",
    "dates_2026_2027": [
      null,
      null
    ],
    "status": "pending",
    "holiday_type": "public_holiday",
    "cn_brief": "泰国的卫塞节在泰历六月满月，纪念佛陀诞生、成道与涅槃，是佛教重要日子，部分场所不售酒。日期每年浮动，以官方公告为准。",
    "en_brief": "Visakha Bucha in Thailand falls on the full moon of the sixth Thai month and marks the Buddha's birth, enlightenment, and passing. It is a major Buddhist day, and some places restrict alcohol sales.",
    "questions": [
      {
        "cn": "你们有纪念宗教人物的日子吗？",
        "en": "Does your country have days marking religious figures?"
      },
      {
        "cn": "这类日子你会去寺庙还是待在家？",
        "en": "On days like this, do you visit a temple or stay home?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [],
    "verified_at": "2026-11-09"
  },
  {
    "id": "diwali",
    "cn": "排灯节",
    "en": "Diwali",
    "country_region": "印度",
    "theme": "家庭",
    "date_rule": "印度历节日（2026/2027 日期待核实）",
    "dates_2026_2027": [
      "2026-11-08",
      "2027-10-29"
    ],
    "status": "pending",
    "holiday_type": "festival_day",
    "cn_brief": "印度的灯光节，常见点灯、家庭聚会和互赠甜点。不同地区与社群的过法差异很大，不要假设每个人都庆祝。",
    "en_brief": "The Indian festival of lights, often marked with lamps, family gatherings, and sweets. Practice varies widely by region and community; do not assume everyone celebrates.",
    "questions": [
      {
        "cn": "你家乡有类似的灯光节日吗？",
        "en": "Is there a festival of lights where you are from?"
      },
      {
        "cn": "节日里你更喜欢在家还是出门？",
        "en": "During festivals, do you prefer staying home or going out?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [],
    "verified_at": "2026-11-09"
  },
  {
    "id": "holi",
    "cn": "洒红节",
    "en": "Holi",
    "country_region": "印度",
    "theme": "文化",
    "date_rule": "印度历春季节日（2026/2027 公历日期待确认）",
    "dates_2026_2027": [
      null,
      null
    ],
    "status": "pending",
    "holiday_type": "festival_day",
    "cn_brief": "印度的洒红节在春天，人们互相泼洒彩粉和水，象征色彩与新生。日期按印度历计算，各地不同，也有人不参加。",
    "en_brief": "Holi is a spring festival in India where people throw coloured powder and water, celebrating colour and renewal. The date follows the Hindu calendar and varies by region; some people do not take part.",
    "questions": [
      {
        "cn": "你参加过泼彩粉的节日吗？",
        "en": "Have you joined a festival where people throw coloured powder?"
      },
      {
        "cn": "节日里你更喜欢热闹还是安静？",
        "en": "At festivals, do you prefer lively crowds or a quiet time?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [
      "https://en.wikipedia.org/wiki/Holi"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "republic-day",
    "cn": "共和国日",
    "en": "Republic Day",
    "country_region": "印度",
    "theme": "国家",
    "date_rule": "固定公历 1 月 26 日",
    "dates_2026_2027": [
      "2026-01-26",
      "2027-01-26"
    ],
    "status": "fixed",
    "holiday_type": "public_holiday",
    "cn_brief": "印度共和国日在 1 月 26 日，是国定假日。首都举行阅兵与游行，学校也有活动；各地庆祝规模不一样。",
    "en_brief": "Republic Day in India is on 26 January and is a national holiday. The capital holds a parade and schools often mark it, though the scale of celebrations varies by place.",
    "questions": [
      {
        "cn": "你们的国庆会阅兵或游行吗？",
        "en": "Does your national day include a parade?"
      },
      {
        "cn": "你会去现场还是在家看电视？",
        "en": "Would you go in person or watch it at home?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [],
    "source_note": "公历固定日期；来源待补",
    "verified_at": "2026-11-09"
  },
  {
    "id": "gandhi-jayanti",
    "cn": "甘地诞辰日",
    "en": "Gandhi Jayanti",
    "country_region": "印度",
    "theme": "纪念",
    "date_rule": "固定公历 10 月 2 日",
    "dates_2026_2027": [
      "2026-10-02",
      "2027-10-02"
    ],
    "status": "fixed",
    "holiday_type": "public_holiday",
    "cn_brief": "甘地诞辰日是印度国定假日，10 月 2 日。常见纪念活动与献花，部分场所会有限制；不是每个人都以同样方式过。",
    "en_brief": "Gandhi Jayanti on 2 October is a national holiday in India, marked with commemorations and flower offerings. Some venues have restrictions, and not everyone observes it in the same way.",
    "questions": [
      {
        "cn": "你们有纪念重要人物的日子吗？",
        "en": "Does your country have a day honouring an important figure?"
      },
      {
        "cn": "你了解这个人的哪一面？",
        "en": "Which side of that person do you know best?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [],
    "source_note": "公历固定日期；来源待补",
    "verified_at": "2026-11-09"
  },
  {
    "id": "singapore-nd",
    "cn": "新加坡国庆日",
    "en": "National Day",
    "country_region": "新加坡",
    "theme": "国家",
    "date_rule": "固定公历 8 月 9 日",
    "dates_2026_2027": [
      "2026-08-09",
      "2027-08-09"
    ],
    "status": "fixed",
    "holiday_type": "public_holiday",
    "cn_brief": "新加坡的国庆公共假期，常见庆典、烟花和社区活动。具体安排以当年官方公告为准。",
    "en_brief": "Singapore's national day public holiday, often marked with celebrations, fireworks, and community events. Check the official programme each year.",
    "questions": [
      {
        "cn": "你们国庆会看庆典还是和朋友聚？",
        "en": "On your national day, do you watch the celebrations or meet friends?"
      },
      {
        "cn": "你会为国庆专门出门吗？",
        "en": "Do you go out specially for national day?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [
      "https://www.mom.gov.sg/employment-practices/public-holidays"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "vesak-day",
    "cn": "卫塞节（新加坡）",
    "en": "Vesak Day",
    "country_region": "新加坡",
    "theme": "宗教",
    "date_rule": "农历四月十五（待确认）",
    "dates_2026_2027": [
      "2026-05-31",
      "2027-05-20"
    ],
    "status": "pending",
    "holiday_type": "public_holiday",
    "cn_brief": "新加坡的卫塞节纪念佛陀诞生、成道与涅槃，是公共假期。常见到寺庙祈福、浴佛与布施，日期按农历计算。",
    "en_brief": "Vesak Day in Singapore marks the Buddha's birth, enlightenment, and passing, and is a public holiday. Temple visits, bathing the Buddha, and charity are common; the date follows the lunar calendar.",
    "questions": [
      {
        "cn": "你们有佛教节日吗？",
        "en": "Does your country have Buddhist holidays?"
      },
      {
        "cn": "节日你会去寺庙还是和家人吃饭？",
        "en": "On this day, do you visit a temple or have a family meal?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [
      "https://www.mom.gov.sg/employment-practices/public-holidays"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "hari-raya-puasa",
    "cn": "开斋节（新加坡）",
    "en": "Hari Raya Puasa",
    "country_region": "新加坡",
    "theme": "宗教",
    "date_rule": "伊斯兰历十月一日（待确认）",
    "dates_2026_2027": [
      "2026-03-21",
      "2027-03-10"
    ],
    "status": "pending",
    "holiday_type": "public_holiday",
    "cn_brief": "新加坡的开斋节是公共假期，标志斋月结束。常见家庭团聚、互道祝福与准备节日食物，日期按伊斯兰历。",
    "en_brief": "Hari Raya Puasa in Singapore is a public holiday that marks the end of Ramadan. Family gatherings, greetings, and festive food are common, and the date follows the Islamic calendar.",
    "questions": [
      {
        "cn": "你们有斋戒或开斋的习俗吗？",
        "en": "Do you have a fasting or fast-breaking tradition?"
      },
      {
        "cn": "节日里你会去谁家做客？",
        "en": "Whose home would you visit during this festival?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [
      "https://www.mom.gov.sg/employment-practices/public-holidays"
    ],
    "verified_at": "2026-11-09"
  },
  {
    "id": "new-year",
    "cn": "元旦",
    "en": "New Year's Day",
    "country_region": "国际",
    "theme": "新年",
    "date_rule": "固定公历 1 月 1 日",
    "dates_2026_2027": [
      "2026-01-01",
      "2027-01-01"
    ],
    "status": "fixed",
    "holiday_type": "public_holiday",
    "cn_brief": "公历新年的第一天。不同地方有倒计时、烟花或家庭聚餐，也有人只把它当成一个普通休息日。",
    "en_brief": "The first day of the calendar year. Some places have countdowns, fireworks, or family meals; others treat it as a quiet day off.",
    "questions": [
      {
        "cn": "你们那里跨年有什么固定习惯吗？",
        "en": "Is there a fixed way people mark the new year where you are from?"
      },
      {
        "cn": "你更喜欢热闹倒数还是安静待在家？",
        "en": "Would you rather join a big countdown or stay in quietly?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [],
    "source_note": "公历固定日期；来源待补",
    "verified_at": "2026-11-09"
  },
  {
    "id": "womens-day",
    "cn": "国际妇女节",
    "en": "International Women's Day",
    "country_region": "国际",
    "theme": "纪念",
    "date_rule": "固定公历 3 月 8 日",
    "dates_2026_2027": [
      "2026-03-08",
      "2027-03-08"
    ],
    "status": "fixed",
    "holiday_type": "observance",
    "cn_brief": "关注女性权益与贡献的国际纪念日。不同国家有不同做法，有的是公共假期，有的只是纪念活动。",
    "en_brief": "An international day recognising women's rights and contributions. Practice differs by country: some have a public holiday, others only events.",
    "questions": [
      {
        "cn": "你们那里这天会给女性送花吗？",
        "en": "Do people give flowers to women on this day where you are from?"
      },
      {
        "cn": "你觉得这类纪念日更像庆祝还是提醒？",
        "en": "Do you see this day more as a celebration or a reminder?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [],
    "source_note": "公历固定日期；来源待补",
    "verified_at": "2026-11-09"
  },
  {
    "id": "students-day",
    "cn": "国际大学生节",
    "en": "International Students' Day",
    "country_region": "国际",
    "theme": "青年",
    "date_rule": "固定公历 11 月 17 日",
    "dates_2026_2027": [
      "2026-11-17",
      "2027-11-17"
    ],
    "status": "fixed",
    "holiday_type": "observance",
    "cn_brief": "纪念学生运动的国际纪念日，不同学校会有讲座或活动。它更像纪念日，不是普遍放假的节日。",
    "en_brief": "An international commemoration linked to a student movement. Some schools hold talks or events; it is a remembrance day rather than a universal holiday.",
    "questions": [
      {
        "cn": "你读书时学校会办这类纪念活动吗？",
        "en": "Did your school hold events like this when you were a student?"
      },
      {
        "cn": "你大学时最难忘的活动是什么？",
        "en": "What was the most memorable event from your university years?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [],
    "source_note": "公历固定日期；来源待补",
    "verified_at": "2026-11-09"
  },
  {
    "id": "christmas",
    "cn": "圣诞节",
    "en": "Christmas",
    "country_region": "国际",
    "theme": "家庭",
    "date_rule": "固定公历 12 月 25 日",
    "dates_2026_2027": [
      "2026-12-25",
      "2027-12-25"
    ],
    "status": "fixed",
    "holiday_type": "public_holiday",
    "cn_brief": "在许多国家是家庭聚会和交换礼物的日子，也有人只当作年末假期。宗教与家庭习惯差异很大。",
    "en_brief": "In many countries a time for family gatherings and gifts; for others it is simply a year-end break. Religious and family practices vary widely.",
    "questions": [
      {
        "cn": "你们家圣诞节会交换礼物吗？",
        "en": "Does your family exchange gifts at Christmas?"
      },
      {
        "cn": "你更喜欢节日聚餐还是安静休息？",
        "en": "Do you prefer a festive meal or a quiet rest?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [],
    "source_note": "公历固定日期；来源待补",
    "verified_at": "2026-11-09"
  },
  {
    "id": "singles-day",
    "cn": "双十一",
    "en": "Singles' Day",
    "country_region": "中国",
    "theme": "购物",
    "date_rule": "固定公历 11 月 11 日（商业节日，非公共假期）",
    "dates_2026_2027": [
      "2026-11-11",
      "2027-11-11"
    ],
    "status": "fixed",
    "holiday_type": "observance",
    "cn_brief": "原本是校园里的“光棍节”，后来变成大型网购促销日。它不是传统节日，也不放假。",
    "en_brief": "Originally a campus joke about being single, now a major online shopping day. It is not a traditional festival and not a public holiday.",
    "questions": [
      {
        "cn": "你会在双十一买东西吗？",
        "en": "Do you shop on Singles' Day?"
      },
      {
        "cn": "你更喜欢提前计划购物还是看到合适才买？",
        "en": "Do you plan purchases in advance or buy when you see something good?"
      }
    ],
    "related_place_ids": [],
    "source_urls": [],
    "source_note": "公历固定日期；来源待补",
    "verified_at": "2026-11-09"
  },
  {
    "id": "earth-day",
    "cn": "世界地球日",
    "en": "Earth Day",
    "country_region": "国际",
    "theme": "环保",
    "date_rule": "固定公历 4 月 22 日",
    "dates_2026_2027": [
      "2026-04-22",
      "2027-04-22"
    ],
    "status": "fixed",
    "holiday_type": "observance",
    "cn_brief": "世界地球日在 4 月 22 日，关注环境保护。各地有植树、清洁与宣传活动，它不是普遍放假的节日。",
    "en_brief": "Earth Day on 22 April focuses on environmental protection. Tree planting, clean-ups, and awareness events take place in many places, but it is not a widely observed day off at all.",
    "questions": [
      {
        "cn": "你们那里有环保主题的活动吗？",
        "en": "Are there environmental events where you are from?"
      },
      {
        "cn": "旅行时你会注意减少垃圾吗？",
        "en": "Do you try to reduce waste when you travel?"
      }
    ],
    "related_place_ids": [
      115,
      9
    ],
    "source_urls": [],
    "source_note": "公历固定日期；来源待补",
    "verified_at": "2026-11-09"
  }
].map(s => ({
    id: s.id, cn: s.cn, en: s.en, region: s.country_region, theme: s.theme,
    dateRule: s.date_rule,
    y2026: (s.dates_2026_2027 && s.dates_2026_2027[0]) || null,
    y2027: (s.dates_2026_2027 && s.dates_2026_2027[1]) || null,
    status: s.status, briefCn: s.cn_brief, briefEn: s.en_brief, questions: s.questions,
    source: (s.source_urls && s.source_urls[0]) || '来源待补：未取得可靠出处，原型不当作已核实',
    holidayType: s.holiday_type,
    sourceUrls: s.source_urls || [],
    sourceNote: s.source_note || '',
    verifiedAt: s.verified_at || '',
    relatedPlaceIds: s.related_place_ids || []
  }));

  const people = [
    {
      slug: 'oliver', name: 'Oliver Reed', region: '英国·伦敦', regionEn: 'London, United Kingdom', fictional: true,
      personality: '注重计划、讲话简洁、喜欢用实际训练进展交流的健身爱好者。',
      style: '简短、直接、具体、少闲聊。',
      cautions: '不主动建议吵闹酒吧，不替对方编造训练成绩。',
      interests: ['力量训练', '骑行', '10 公里训练'],
      confirmed: [
        { text: 'Oliver goes strength training three mornings a week.', cn: '每周有三个早上做力量训练。' },
        { text: 'Oliver is working toward his first strict pull-up.', cn: '正在练习第一个严格引体向上。' },
        { text: 'Oliver is preparing for his first 10-kilometre race in December.', cn: '正在准备 12 月的第一次 10 公里比赛。' }
      ],
      pending: { text: "Oliver's target finish time for the December 10K (not discussed yet).", cn: '12 月 10 公里的目标完赛时间（还没聊到）。', confirmed: false },
      sessions: [
        {
          date: '2026-11-01', title: '训练与 10 公里计划',
          lines: [
            { who: '我', en: 'How are you balancing your gym work and the 10K plan?', cn: '你怎么平衡力量训练和 10 公里计划？' },
            { who: 'Oliver', en: 'I keep the runs easy after heavy lifting days.', cn: '大重量训练之后，我会把跑步放轻松。' },
            { who: '我', en: 'What is the next milestone?', cn: '下一个目标是什么？' },
            { who: 'Oliver', en: "I'd like to run the full distance comfortably.", cn: '我想舒服地跑完整段距离。' }
          ]
        },
        {
          date: '2026-10-27', title: '新目标出现',
          lines: [
            { who: '我', en: 'How has your training been going?', cn: '最近训练怎么样？' },
            { who: 'Oliver', en: 'The pull-up work is progressing, thanks.', cn: '引体向上有进展，谢谢。' },
            { who: '我', en: 'Any new goals?', cn: '有新的目标吗？' },
            { who: 'Oliver', en: "I'm preparing for my first 10-kilometre race in December.", cn: '我在准备 12 月的第一次 10 公里比赛。' }
          ]
        },
        {
          date: '2026-10-20', title: '第一次聊训练',
          lines: [
            { who: '我', en: 'What do you enjoy doing before work?', cn: '上班前你喜欢做什么？' },
            { who: 'Oliver', en: 'I go strength training three mornings a week.', cn: '我每周有三个早上做力量训练。' },
            { who: '我', en: 'Do you have a particular goal at the gym?', cn: '健身方面有具体目标吗？' },
            { who: 'Oliver', en: "I'm working toward my first strict pull-up.", cn: '我在练第一个严格引体向上。' }
          ]
        }
      ],
      questionsConfirmed: [
        { cn: '你的引体向上目标进展怎么样？', en: 'How is the pull-up goal going?' },
        { cn: '你找到适合每周三个早上的训练节奏了吗？', en: 'Have you found a routine that works for your three gym mornings?' }
      ],
      questionsSuggestion: [
        { cn: '12 月的 10 公里训练进行得如何？', en: 'How is your 10K training for December going?', caution: '来自已确认事实；仍建议先问再展开。' },
        { cn: '轻松跑会影响你的力量训练吗？', en: 'Are easy runs affecting your gym sessions?', caution: '静态示范问句，不是 AI 实时生成，也不是已确认事实。' }
      ],
      chatDemo: {
        note: '固定演示对话：切换人物会换成该人物的独立样本；不调用云端 AI，也不会按你的输入实时生成。',
        topics: [
          {
            id: 'oliver-training', title: '训练与轻松跑',
            messages: [
              { who: 'friend', text: "I did an easy run after yesterday's session. My legs felt heavy at first.", cn: '昨天练完，今天轻松跑了一下。刚开始腿有点沉。' },
              { who: 'me', text: 'Heavy legs after lifting is normal. Did you keep the pace easy?', cn: '大重量训练后腿沉很正常。你有把配速放轻松吗？' },
              { who: 'friend', text: 'Yes, slower than usual. The pull-up work is still the hard part.', cn: '有，比平时慢。引体向上还是最难的部分。' }
            ],
            liveLine: 'I usually keep the same route unless the weather is bad.',
            coach: {
              follow: { en: 'That sounds like the right call. How did the last set feel?', cn: '这个处理挺对的。最后一组感觉怎么样？', basis: '承接对方刚说的轻松跑与引体向上' },
              probe: { en: 'Which part of the pull-up is hardest for you right now?', cn: '现在引体向上对你来说最难的是哪一段？', basis: '来自已确认事实：正在练第一个严格引体向上' }
            }
          },
          {
            id: 'oliver-weekend', title: '周末骑行',
            messages: [
              { who: 'friend', text: 'I might do a short ride this weekend if the weather holds.', cn: '如果天气可以，这周末我可能骑一小段。' },
              { who: 'me', text: 'Nice. Flat route or hills?', cn: '不错。平路还是爬坡？' },
              { who: 'friend', text: 'Probably flat. I do not want to tire my legs before Monday.', cn: '大概是平路。不想周一前把腿练废。' }
            ],
            liveLine: 'I will decide on Saturday morning, depending on the wind.',
            coach: {
              follow: { en: 'Keeping it flat before a training week makes sense.', cn: '训练周前保持平路，确实合理。', basis: '承接对方刚说的周末骑行' },
              probe: { en: 'How long do you usually ride when you keep it easy?', cn: '你轻松骑的时候一般骑多久？', basis: '来自当前示例对话，不是已确认事实' }
            }
          }
        ],
        tags: { placeId: 3, placeNote: '我这边的地方，用于我主动分享，不代表对方行程', festivalMode: 'picker' }
      }
    },
    {
      slug: 'maya', name: 'Maya Torres', region: '美国·奥斯汀', regionEn: 'Austin, United States', fictional: true,
      personality: '热情健谈，喜欢分享设计、独立音乐演出和新鲜体验的创意从业者。',
      style: '轻松、积极、开放式、有趣的追问。',
      cautions: '不要假定她已到海南、已去某场演出或接受邀约。',
      interests: ['平面设计', '独立音乐', '海口小吃'],
      confirmed: [
        { text: 'Maya designs posters for small local bands.', cn: '为本地小乐队设计海报。' },
        { text: 'Maya enjoys small live-music gigs.', cn: '喜欢小型现场音乐演出。' },
        { text: 'Maya is considering a trip to Haikou and wants to try local street food; nothing is booked yet.', cn: '正在考虑来海口、想试本地街头小吃；还没有订票。' }
      ],
      pending: { text: 'The exact dates of Maya\'s Haikou trip are not decided yet.', cn: '海口行程的具体日期（还未确定）。', confirmed: false },
      sessions: [
        {
          date: '2026-11-01', title: '还在看日期',
          lines: [
            { who: '我', en: 'Are you still thinking of visiting Haikou?', cn: '你还在考虑来海口吗？' },
            { who: 'Maya', en: "Yes, I'm checking dates, but nothing is booked yet.", cn: '在，我在看日期，但还没订。' },
            { who: '我', en: 'Would you like a few local food ideas?', cn: '要我给几个本地小吃建议吗？' },
            { who: 'Maya', en: 'Absolutely, especially casual places.', cn: '当然，最好是随便一点的小店。' }
          ]
        },
        {
          date: '2026-10-27', title: '第一次提到海口',
          lines: [
            { who: '我', en: 'Do you have any travel ideas coming up?', cn: '最近有旅行计划吗？' },
            { who: 'Maya', en: "I'm considering a trip to Haikou and want to try local street food.", cn: '我在考虑去海口，想试试本地街头小吃。' },
            { who: '我', en: 'What kinds of dishes are you curious about?', cn: '你对什么菜好奇？' },
            { who: 'Maya', en: 'I like trying something people actually eat every day.', cn: '我喜欢试本地人日常吃的东西。' }
          ]
        }
      ],
      questionsConfirmed: [
        { cn: '最近有为本地乐队做新海报吗？', en: 'Have you made any new posters for local bands?' },
        { cn: '最近看过最好的一场小演出是什么？', en: "What's the best small gig you've seen recently?" }
      ],
      questionsSuggestion: [
        { cn: '如果来海口，你最想试哪种街头小吃？', en: 'What kind of Haikou street food would you like to try?', caution: '来自已确认事实：她想试本地街头小吃；具体口味还没聊。' },
        { cn: '你会先逛小吃摊还是先找小型音乐现场？', en: 'Would you rather explore food stalls or small music venues first?', caution: '静态示范问句，不是 AI 实时生成，也不代表对方已经决定。' }
      ],
      chatDemo: {
        note: '固定演示对话：切换人物会换成该人物的独立样本；不调用云端 AI，也不会按你的输入实时生成。',
        topics: [
          {
            id: 'maya-poster', title: '海报与演出',
            messages: [
              { who: 'friend', text: 'I just finished a poster for a small show on Friday.', cn: '我刚给周五的一场小演出做完海报。' },
              { who: 'me', text: 'What kind of show is it?', cn: '是什么类型的演出？' },
              { who: 'friend', text: 'Two local bands, very small venue. I like keeping the posters hand-drawn.', cn: '两支本地乐队，场地很小。我喜欢把海报做成手绘的感觉。' }
            ],
            liveLine: 'I mostly sketch the poster by hand before I touch the computer.',
            coach: {
              follow: { en: 'Hand-drawn posters must stand out in a small venue.', cn: '手绘海报在小场地里应该很显眼。', basis: '承接对方刚说的手绘海报与小场地' },
              probe: { en: "Do you start with the bands' sound or with an image?", cn: '你是先想乐队的声音，还是先想画面？', basis: '来自已确认事实：为本地小乐队设计海报' }
            }
          },
          {
            id: 'maya-haikou', title: '海口行程',
            messages: [
              { who: 'friend', text: 'I am still comparing dates for Haikou, nothing booked yet.', cn: '我还在比较去海口的日期，还没订。' },
              { who: 'me', text: 'Would a weekend or a longer stay suit you better?', cn: '你更适合周末还是多待几天？' },
              { who: 'friend', text: 'Maybe four or five days. I mostly want to walk and eat.', cn: '可能四五天。我最想随便走和吃东西。' }
            ],
            liveLine: 'I want a few days with no fixed schedule, just walking and eating.',
            coach: {
              follow: { en: 'Four or five days gives you room to walk and eat without rushing.', cn: '四五天足够慢慢走、慢慢吃，不用赶。', basis: '承接对方刚说的四五天与随便走' },
              probe: { en: 'Would you rather start with a market or a small street food street?', cn: '你想先从市场还是小吃街开始？', basis: '来自已确认事实：想试本地街头小吃；日期仍未定' }
            }
          }
        ],
        tags: { placeId: 3, placeNote: '我这边的地方，用于主动分享；她还在看行程，未确认会来', festivalMode: 'picker' }
      }
    },
    {
      slug: 'jieun', name: 'Ji-eun Park', region: '韩国·首尔', regionEn: 'Seoul, South Korea', fictional: true,
      personality: '耐心内敛、偏好安静环境、喜欢街拍与咖啡馆的摄影爱好者。',
      style: '给时间组织语言，问具体问题，不催促。',
      cautions: '不要假定她喜欢吵闹场合，不要评价英语水平。',
      interests: ['街拍', '安静咖啡馆', '老街道'],
      confirmed: [
        { text: 'Ji-eun enjoys photographing old streets.', cn: '喜欢拍老街。' },
        { text: 'Ji-eun prefers quiet cafes to crowded bars.', cn: '更喜欢安静咖啡馆，而不是拥挤酒吧。' },
        { text: 'Ji-eun is practising English to talk about her photography.', cn: '正在练习用英语讲摄影。' }
      ],
      pending: { text: 'Whether Ji-eun wants to publish a small photo series this year (not discussed yet).', cn: '今年是否想发布一组小照片系列（还没聊到）。', confirmed: false },
      sessions: [
        {
          date: '2026-11-01', title: '描述晨光照片',
          lines: [
            { who: '我', en: 'Would you like to describe your morning-light photo?', cn: '你想描述那张晨光照片吗？' },
            { who: 'Ji-eun', en: 'Yes, but I may need a little time to find the words.', cn: '想，但我可能需要一点时间找词。' },
            { who: '我', en: 'Of course. What caught your eye first?', cn: '当然。你最先注意到什么？' },
            { who: 'Ji-eun', en: 'The shadows on the walls.', cn: '墙上的影子。' }
          ]
        },
        {
          date: '2026-10-27', title: '一条老巷子',
          lines: [
            { who: '我', en: 'Have you taken any interesting photos lately?', cn: '最近拍了什么有趣的照片？' },
            { who: 'Ji-eun', en: 'I found a beautiful old alley last weekend.', cn: '上周末发现了一条很美的老巷子。' },
            { who: '我', en: 'Would you like to share the story in English?', cn: '想用英语讲讲这个故事吗？' },
            { who: 'Ji-eun', en: "I'm practising English to talk about my photography.", cn: '我在练习用英语讲摄影。' }
          ]
        }
      ],
      questionsConfirmed: [
        { cn: '你最近又找到想拍的老街了吗？', en: "Have you found another old street you'd like to photograph?" },
        { cn: '最近有去新的安静咖啡馆吗？', en: 'Did you try any new quiet cafes recently?' }
      ],
      questionsSuggestion: [
        { cn: '你想练习用英语描述一张照片吗？', en: 'Would you like to practise describing a photograph in English?', caution: '来自已确认事实：正在练习用英语讲摄影；先征得同意。' },
        { cn: '那张晨光照片想讲什么故事？', en: 'What story does your morning-light picture tell?', caution: '静态示范问句，不是 AI 实时生成，也不是已确认事实。' }
      ],
      chatDemo: {
        note: '固定演示对话：切换人物会换成该人物的独立样本；不调用云端 AI，也不会按你的输入实时生成。',
        topics: [
          {
            id: 'jieun-alley', title: '老街与晨光',
            messages: [
              { who: 'friend', text: 'I went back to the old alley this morning. The light was better than last time.', cn: '今天早上我又去了那条老巷子。光线比上次好。' },
              { who: 'me', text: 'What changed with the light?', cn: '光线有什么不一样？' },
              { who: 'friend', text: 'It came from the side, so the wall texture showed up.', cn: '光从侧面来，墙面的纹理就出来了。' }
            ],
            liveLine: 'The light changes quickly in that alley, so I take my time.',
            coach: {
              follow: { en: 'Side light really brings out the wall texture.', cn: '侧光确实能把墙面纹理带出来。', basis: '承接对方刚说的侧光与墙面纹理' },
              probe: { en: 'Was there one frame you almost missed?', cn: '有没有哪一张是你差点错过的？', basis: '来自已确认事实：喜欢拍老街；不催她长回答' }
            }
          },
          {
            id: 'jieun-cafe', title: '安静咖啡馆',
            messages: [
              { who: 'friend', text: 'I found a quiet cafe near the alley. Almost no music.', cn: '我在巷子附近找到一家安静的咖啡馆，几乎没有音乐。' },
              { who: 'me', text: 'That sounds like a good place to sort your photos.', cn: '听起来很适合整理照片。' },
              { who: 'friend', text: 'Yes, I can look at the shots slowly there.', cn: '对，我可以在那里慢慢看照片。' }
            ],
            liveLine: 'A quiet table helps me choose which photos to keep.',
            coach: {
              follow: { en: 'A quiet table makes it easier to choose the keepers.', cn: '安静的桌子更容易挑出要留下的照片。', basis: '承接对方刚说的安静咖啡馆' },
              probe: { en: 'Do you edit on your phone or wait until you get home?', cn: '你是在手机上修图，还是回家再弄？', basis: '来自已确认事实：更喜欢安静咖啡馆；不假定她的工作流' }
            }
          }
        ],
        tags: { placeId: 3, placeNote: '我这边的地方，用于主动分享；她的行程未确认', festivalMode: 'picker' }
      }
    }
  ];

  /* B/C 分类示范样本：现有演示数据集 9 条全是 A 类，分类筛选无法演示。
   * 这两条只在原型内追加，明确标注“分类示范样本”，不冒充生产作品、不声称已验收。 */
  const demoWorks = [
    {
      id: 'DEMO-B1', name: '单词卡片 · Word Cards', cat: 'B', demoAdded: true,
      cn: '这是我做的一个背单词小工具。把当天遇到的生词做成卡片，正面是英文，翻过来是中文和一句自己的例句。复习时按忘记、模糊、记住三档标记，第二天先看没记住的。',
      en: 'I made a small vocabulary tool for words I meet during the day. Each card has English on the front, and Chinese plus my own example sentence on the back. When I review, I mark a word as forgotten, unsure, or known, and the next day I start with the ones I missed.',
      status: '原型补充的 B 类分类示范样本，不是生产数据',
      steps: [
        { n: 1, cn: '新建卡片：输入英文、中文和一句自己的例句。', detail: '', en: 'I add a word with its Chinese meaning and one example sentence of my own.' },
        { n: 2, cn: '复习标记：按忘记、模糊、记住三档标记。', detail: '', en: 'When I review, I mark each word as forgotten, unsure, or known.' }
      ]
    },
    {
      id: 'DEMO-C1', name: '社区活动板 · Community Board', cat: 'C', demoAdded: true,
      cn: '这是我做的一个小区活动信息板。物业和居民都可以发活动，比如周末跳蚤市场、羽毛球缺人、旧物交换。每条信息只保留时间、地点、联系方式和一句话说明，避免刷屏。',
      en: 'I made a small board for neighbourhood events. Residents can post things like a weekend flea market, a badminton game that needs one more player, or a swap of used items. Each post keeps only the time, place, contact, and one short description, so the board does not turn into a noisy chat group.',
      status: '原型补充的 C 类分类示范样本，不是生产数据',
      steps: [
        { n: 1, cn: '发布活动：只填时间、地点、联系方式和一句话说明。', detail: '', en: 'I post an event with only the time, place, contact, and one short line.' },
        { n: 2, cn: '按时间浏览：只看这周末或某个分类。', detail: '', en: 'I browse by time, for example only this weekend.' }
      ]
    }
  ];
  const colorFor = i => ['#0c7766', '#b07a45', '#4b6b8a', '#8a5b6b', '#5d7a45', '#7a5d9a'][i % 6];

  window.N06 = {
    meta: {
      title: 'N06 原型',
      version: 'N06-PROTOTYPE-0.2',
      builtAt: '2026-11-09',
      note: '独立 HTML 原型。地点长文、节日日期、关联问题与聊天建议均为固定示范样本，不写入正式 APP 与生产数据，也不调用云端 AI 实时生成。图片方面：按 PHOTO_MANIFEST.csv 记录排除的 11 张归档图已从展示中移除（未重开来源页核验），其余图片仅有清单记录、未逐张重开来源页核验，不表述为已确认真实对应。'
    },
    places,
    festivals,
    people,
    works: [
      ...(window.N06_REPO.works || []).map((w, i) => ({ ...w, color: colorFor(i), recycled: false })),
      ...demoWorks.map((w, i) => ({ ...w, color: colorFor(i + 3), recycled: false }))
    ],
    stories: (window.N06_REPO.stories || []).map(s => ({ ...s, demoEdited: false }))
  };
})();
