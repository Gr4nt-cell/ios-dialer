// Run in the Scripter plugin in the existing iOS Dialer Figma file:
// https://www.figma.com/design/s5Vt3iKEuQR68XXEtXy20B
// Creates an editable light-only comparison using instances of the ORIGINAL keypad component.
async function matchKeypadMaterial() {
  const master = await figma.getNodeByIdAsync('3:106');
  if (!master || master.type !== 'COMPONENT' || master.name !== 'Glass / Dial key') {
    throw new Error('Original Glass / Dial key component not found. Open the linked dialer design file.');
  }
  const pageName = 'Light / Matching keypad material';
  if (figma.root.children.some(p => p.name === pageName)) throw new Error('This reference page already exists.');
  await Promise.all(['Regular', 'Medium', 'Bold'].map(style => figma.loadFontAsync({family: 'Roboto', style})));
  for (const n of master.findAllWithCriteria({types:['TEXT']})) {
    for (const segment of n.getStyledTextSegments(['fontName'])) await figma.loadFontAsync(segment.fontName);
  }
  const properties = master.componentPropertyDefinitions;
  const digit = Object.keys(properties).find(k => k.startsWith('Digit'));
  const letters = Object.keys(properties).find(k => k.startsWith('Letters'));
  if (!digit || !letters) throw new Error('The keypad component properties changed; inspect before updating.');
  const page = figma.createPage(); page.name = pageName; await figma.setCurrentPageAsync(page);
  const created = [page.id];
  const rgb = h => ({r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255});
  const fill = (h,a=1) => ({type:'SOLID',color:rgb(h),opacity:a});
  function add(p,n) {p.appendChild(n);created.push(n.id);return n;}
  function text(p,label,size=14,weight='Regular',color='#18191B') {
    const n=figma.createText();n.fontName={family:'Roboto',style:weight};n.characters=label;n.fontSize=size;n.fills=[fill(color)];return add(p,n);
  }
  function at(n,x,y) {n.x=x;n.y=y;return n;}
  function box(p,name,w,h) {const n=figma.createFrame();n.name=name;n.resize(w,h);n.fills=[];return add(p,n);}
  function material(p,name,w,h,r,d='',l='') {
    const n=master.createInstance();n.name=name;n.setProperties({[digit]:d,[letters]:l});n.resize(w,h);n.cornerRadius=r;add(p,n);created.push(...n.findAll(()=>true).map(c=>c.id));return n;
  }
  const board=box(page,'Keypad material / Light-mode parity',1080,620);at(board,80,80);
  board.fills=[{type:'GRADIENT_LINEAR',gradientTransform:[[.7,.7,-.2],[-.7,.7,.5]],gradientStops:[
    {position:0,color:{...rgb('#DDEBFF'),a:1}},{position:.5,color:{...rgb('#F7E4F0'),a:1}},{position:1,color:{...rgb('#DDF4EA'),a:1}}]}];
  at(text(board,'One glass material. Three surfaces.',27,'Bold'),36,28);
  at(text(board,'Light mode only • layout, icons and actions retained',14,'Regular','#73767C'),36,70);
  at(text(board,'KEYPAD REFERENCE',12,'Bold','#73767C'),36,128);
  at(material(board,'Keypad 2 / original material',74,74,37,'2','ABC'),58,172);
  at(text(board,'Original key',13,'Medium'),57,261);
  const card=box(board,'Photo-free contact card',80,106);at(card,245,160);card.clipsContent=true;card.cornerRadius=22;
  at(material(card,'Shared keypad material',80,106,22),0,0);at(text(card,'AM',29,'Medium','#73767C'),16,32);
  at(text(board,'Ama Mensah',12,'Medium'),245,275);
  const favorite=box(board,'Photo-free favorite card',80,106);at(favorite,366,160);favorite.clipsContent=true;favorite.cornerRadius=22;
  at(material(favorite,'Shared keypad material',80,106,22),0,0);at(text(favorite,'KA',29,'Medium','#73767C'),17,19);
  at(text(favorite,'Kwame',11.5,'Bold'),10,73);at(text(favorite,'mobile',9.5,'Regular','#73767C'),10,89);
  at(text(board,'CONTACTS / FAVORITES',12,'Bold','#73767C'),245,128);
  at(text(board,'IN-CALL BUTTONS',12,'Bold','#73767C'),570,128);
  const shapes={"speaker": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\" class=\"ionicon\"><path d=\"M232 416a23.88 23.88 0 0 1-14.2-4.68 8 8 0 0 1-.66-.51L125.76 336H56a24 24 0 0 1-24-24V200a24 24 0 0 1 24-24h69.75l91.37-74.81a8 8 0 0 1 .66-.51A24 24 0 0 1 256 120v272a24 24 0 0 1-24 24M320 336a16 16 0 0 1-14.29-23.19c9.49-18.87 14.3-38 14.3-56.81 0-19.38-4.66-37.94-14.25-56.73a16 16 0 0 1 28.5-14.54C346.19 208.12 352 231.44 352 256c0 23.86-6 47.81-17.7 71.19A16 16 0 0 1 320 336\"/><path d=\"M368 384a16 16 0 0 1-13.86-24C373.05 327.09 384 299.51 384 256c0-44.17-10.93-71.56-29.82-103.94a16 16 0 0 1 27.64-16.12C402.92 172.11 416 204.81 416 256c0 50.43-13.06 83.29-34.13 120a16 16 0 0 1-13.87 8\"/><path d=\"M416 432a16 16 0 0 1-13.39-24.74C429.85 365.47 448 323.76 448 256c0-66.5-18.18-108.62-45.49-151.39a16 16 0 1 1 27-17.22C459.81 134.89 480 181.74 480 256c0 64.75-14.66 113.63-50.6 168.74A16 16 0 0 1 416 432\"/></svg>", "hold": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\" class=\"ionicon\"><path d=\"M208 432h-48a16 16 0 0 1-16-16V96a16 16 0 0 1 16-16h48a16 16 0 0 1 16 16v320a16 16 0 0 1-16 16M352 432h-48a16 16 0 0 1-16-16V96a16 16 0 0 1 16-16h48a16 16 0 0 1 16 16v320a16 16 0 0 1-16 16\"/></svg>", "mute": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\" class=\"ionicon\"><path d=\"M192 448h128M384 208v32c0 70.4-57.6 128-128 128h0c-70.4 0-128-57.6-128-128v-32M256 368v80\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"32px\"/><path d=\"M256 320a78.83 78.83 0 0 1-56.55-24.1A80.9 80.9 0 0 1 176 239V128a79.69 79.69 0 0 1 80-80c44.86 0 80 35.14 80 80v111c0 44.66-35.89 81-80 81\"/></svg>"};
  for (const [i,[name,path]] of Object.entries(shapes).entries()) {
    const x=590+i*132;at(material(board,'Call '+name,72,72,36),x,172);
    const vector=figma.createNodeFromSvg(path.replace('<svg ', '<svg width="27" height="27" ').replace(/currentColor/g,'#22343A'));
    vector.resize(27,27);
    add(board,vector);created.push(...vector.findAll(()=>true).map(c=>c.id));at(vector,x+22.5,194.5);
    at(text(board,name[0].toUpperCase()+name.slice(1),12,'Medium'),x+18,261);
  }
  at(text(board,'No extra white washes or dark label gradient on photo-free light cards.',16,'Medium'),36,354);
  at(text(board,'Neutral buttons use the keypad’s tint, opacity, rim, sheen and soft depth.',16,'Medium'),36,388);
  at(text(board,'Answer/end retain their action colors. Photos and dark mode keep their existing rendering.',14,'Regular','#73767C'),36,426);
  at(text(board,'Design reference only. Source changes and regression checks are documented in the update package.',12,'Regular','#73767C'),36,556);
  figma.viewport.scrollAndZoomIntoView([board]);
  return {createdNodeIds:created,board:board.id,materialComponentId:master.id};
}
console.log(await matchKeypadMaterial());
