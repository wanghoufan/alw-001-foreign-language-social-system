/*
 * T3 基线快照（只读对照，不参与页面运行）。
 * 来源：socialmate-v1.2/source/V1.1-baseline.html 在 2026-11-04 本任务改模板前的工作区版本。
 * git HEAD 的同一文件仍是更早的 1976 行版本，不含这些函数，因此用本快照保证 --baseline 可复现。
 */
const SM_LEXICON=[
 [/hong ?han( ?lake)?( ?park)?|hong ?cheng( ?lake)?( ?park)?|hong ?chen( ?lake)?( ?park)?|红城湖/gi,'红城湖公园'],
 [/hai ?dian|海甸/gi,'海甸岛'],
 [/guo ?xing|国兴/gi,'国兴大道'],
 [/qi ?lou|kilo|骑楼/gi,'骑楼老街'],
 [/sem ?porna|semporna|se ?corner|仙本那/gi,'仙本那'],
 [/ever ?green|万绿园/gi,'万绿园'],
 [/haikou bay|海口湾/gi,'海口湾'],
 [/baisha ?men|白沙门/gi,'白沙门公园'],
];
function smNormalize(text){let out=String(text||'');for(const [re,rep] of SM_LEXICON)out=out.replace(re,rep);return out}
function currentTopic(){
 let text=smNormalize((S.session?.messages||[]).slice(-4).map(m=>m.text).join(' ')).toLowerCase();
 if(/running|jog|runner|outdoor|hiking|walk|park|跑步|慢跑|户外|散步|徒步/.test(text))return 'running';
 if(/coffee|cafe|latte|espresso|咖啡|拿铁/.test(text))return 'coffee';
 if(/app|software|coding|编程|软件/.test(text))return 'software';
 if(/beach|sea|sunset|海滩|海边|日落/.test(text))return 'beach';
 return text?'other':'none';
}
function coachPlan(){
 let kind=currentTopic(),choices={
 running:{name:'户外跑步',
  respond:'That sounds great! Running outdoors is a nice way to explore a city.',
  respondZh:'听起来不错！在户外跑步是认识一座城市的好办法。',
  ask:['Do you prefer running by the sea or in a park?','Do you usually go running in the morning or the evening?','Have you explored any of the waterfront parks around Haikou?'],
  askZh:['你更喜欢在海边跑，还是在公园跑？','你一般早上跑，还是傍晚跑？','海口滨海一带的公园你去过吗？'],
  share:'There’s a place called Evergreen Park in Haikou, and there’s also a waterfront walk nearby. I can show you both.',
  shareZh:'海口有个万绿园，附近还有滨海步道，我可以带你去看看。'},
 coffee:{name:'咖啡',
  respond:'Coffee is a great way to discover new neighborhoods.',
  respondZh:'咖啡是认识新街区的好方式。',
  ask:['What kind of coffee do you usually drink?','Have you found any cafés you like in Haikou?','Would you like to explore a small local café?'],
  askZh:['你平时喝什么咖啡？','你在海口有喜欢的咖啡馆吗？','想不想一起去一家本地小咖啡馆？'],
  share:'I enjoy medium-roast coffee and often make lattes at home.',
  shareZh:'我喜欢中深烘焙，常在家做拿铁。'},
 software:{name:'软件',
  respond:'That is an interesting topic. I enjoy making practical little apps.',
  respondZh:'这个话题有意思，我喜欢做实用的小软件。',
  ask:['What kind of apps do you use most often?','Have you ever had an idea for an app?','Would you like to see a small project I built?'],
  askZh:['你最常用哪一类软件？','你有没有想过做一个自己的软件？','想看看我做的一个小项目吗？'],
  share:'I like building apps that solve everyday problems.',
  shareZh:'我喜欢做解决日常小问题的软件。'},
 beach:{name:'海边',
  respond:'There are some great coastal spots in Hainan.',
  respondZh:'海南有不少很棒的海边。',
  ask:['Do you prefer quiet beaches or lively waterfronts?','Do you enjoy sunset walks?','Have you been to Haikou Bay?'],
  askZh:['你喜欢安静的海滩，还是热闹的海滨？','你喜欢日落时分散步吗？','你去过海口湾吗？'],
  share:'I can show you a few local places by the sea.',
  shareZh:'我可以带你看几个本地海边的地方。'},
 other:{name:'继续交流',
  respond:'Oh, that sounds interesting!',
  respondZh:'哦，听起来很有意思！',
  ask:['How did you get into that?','What do you enjoy most about it?','What would you like to try next?'],
  askZh:['你是怎么开始做这件事的？','你最喜欢它的哪一点？','你接下来想尝试什么？'],
  share:'I was born and raised in Haikou, so I can suggest some local spots.',
  shareZh:'我在海口长大，可以给你推荐一些本地的地方。'}
 };
 return choices[kind]||null;
}
function suggestionsNow(){
 const real=S.aiState==='ready'&&S.ai?S.ai:null;
 const base=coachPlan()||{};
 const name=(real&&real.topic)||base.name||'继续交流';
 const clean=(x)=>String(x||'').trim();
 const uniq=(arr)=>{const seen=new Set(),out=[];for(const it of arr){const en=clean(it.en);if(!en||seen.has(en))continue;seen.add(en);out.push({en,zh:clean(it.zh)})}return out};
 const respondItems=uniq([
  {en:real?real.reply:'',zh:''},
  {en:base.respond,zh:base.respondZh},
  {en:'That sounds interesting. Tell me a little more.',zh:'听起来很有意思，能再多说一点吗？'},
 ]);
 const askItems=uniq([
  ...((real&&Array.isArray(real.questions))?real.questions.map(en=>({en,zh:''})):[]),
  ...((base.ask||[]).map((en,i)=>({en,zh:(base.askZh||[])[i]||''})))
 ]);
 const shareItems=uniq([
  {en:real?real.share:'',zh:''},
  {en:base.share,zh:base.shareZh},
  {en:'I’ve been exploring Haikou too. I can share a local tip.',zh:'我也在海口到处走走，可以分享一个本地小建议。'},
 ]);
 const switchItems=uniq([
  {en:'By the way, have you tried any good coffee nearby?',zh:'对了，附近有不错的咖啡吗？'},
  {en:'Speaking of Haikou, have you been to Qilou Old Street?',zh:'说到海口，你去过骑楼老街吗？'},
  {en:'What are your plans for the weekend?',zh:'你周末有什么安排？'},
 ]);
 return {name,ai:!!real,groups:[
  {key:'respond',label:'自然接话',hint:'先接住对方',items:respondItems.slice(0,3)},
  {key:'ask',label:'继续追问',hint:'把话接下去',items:askItems.slice(0,3)},
  {key:'share',label:'分享自己',hint:'拉近距离',items:shareItems.slice(0,3)},
  {key:'switch',label:'转换话题',hint:'自然换题',items:switchItems.slice(0,3)},
 ]};
}