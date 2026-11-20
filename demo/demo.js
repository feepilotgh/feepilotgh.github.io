/* FeePilot demo data: everything lives in memory and disappears on refresh. */
(function(){
 var uid=function(){return 'x'+Math.random().toString(36).slice(2,10)+Date.now().toString(36)};
 var NOW=Date.now(), DAY=864e5, iso=function(t){return new Date(t).toISOString()}, day=function(t){return iso(t).slice(0,10)};
 var PX='data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#2158D6"/><circle cx="32" cy="26" r="12" fill="#fff"/></svg>');var SCH='sch1', ME='u-owner';
 var T={schools:[{id:SCH,name:'Bright Future Academy',logo_path:null,address:'Kumasi, Ashanti',phone:'0244123456'}],
  school_members:[{school_id:SCH,user_id:ME,role:'proprietor',active:true}],
  students:[],fee_items:[],payments:[],expenses:[],accounts:[],cashbook:[],method_accounts:[],budgets:[],suppliers:[],supplier_txns:[],
  academic_years:[{id:'y1',school_id:SCH,name:'2026/2027',start_date:'2026-09-01',end_date:'2027-07-31',status:'open'}],terms:[{id:'t1',school_id:SCH,year_id:'y1',name:'Term 1',start_date:'2026-09-01',end_date:'2026-12-15'}],
  carry_forwards:[],sms_messages:[],sms_schedules:[],sms_templates:[],sms_settings:[],sms_usage:[{month:'2026-10-01',sent_count:42,cost_minor:210}],
  plans:[{id:'pl1',name:'Standard',price_minor:15000,billing_interval:'term'}],subscriptions:[{school_id:SCH,status:'trial',trial_ends_at:iso(NOW+9*DAY),plan_id:'pl1'}]};
 var names=['Ama Mensah','Kofi Boateng','Akosua Owusu','Yaw Asante','Abena Osei','Kwame Adjei','Efua Quaye','Nana Agyeman','Esi Darko','Kojo Antwi','Adwoa Sarpong','Kwesi Appiah','Maame Serwaa','Yaa Asantewaa','Fiifi Mensah','Selina Ofori','Prince Tetteh','Gifty Annan','Isaac Ampofo','Linda Badu','Michael Asare','Patience Nkrumah','Samuel Obeng','Theresa Boakye','Daniel Frimpong','Mavis Acheampong','Emmanuel Kyei','Joyce Amoah','Richard Opoku','Vivian Addo'];
 var classes=['Basic 1A','Basic 2A','Basic 3B','Basic 4A','Basic 5A','JHS 1'];
 names.forEach(function(n,i){var id='s'+i;T.students.push({id:id,school_id:SCH,student_no:'BFA'+String(1001+i),full_name:n,class_name:classes[i%6],gender:i%2?'F':'M',guardian_name:'Mr/Mrs '+n.split(' ')[1],guardian_phone:'02'+(40000000+i*7919).toString().slice(0,8),status:'active',sms_opt_out:false,photo_path:null,created_at:iso(NOW-100*DAY)});
  [['Tuition',45000],['Feeding',18000],['PTA levy',5000]].forEach(function(c,j){var fid='f'+i+'_'+j;T.fee_items.push({id:fid,school_id:SCH,student_id:id,category:c[0],academic_year:'2026/2027',amount_minor:c[1],due_date:day(NOW+(i%5-2)*7*DAY),carried_to:null});
   var paid=(i%4===0)?c[1]:(i%4===1?Math.floor(c[1]/2):0); if(i%7===0&&j===2)paid=0;
   if(paid>0)T.payments.push({id:'p'+i+'_'+j,school_id:SCH,fee_item_id:fid,student_id:id,amount_minor:paid,method:['Cash','Mobile Money','Bank Transfer'][(i+j)%3],reference:null,receipt_no:'FP-2026-'+String(T.payments.length+1).padStart(6,'0'),occurred_at:iso(NOW-((i*3+j)%25)*DAY),created_at:iso(NOW-((i*3+j)%25)*DAY),recorded_by:ME,reversal_of:null});});});
 T.accounts.push({id:'a1',school_id:SCH,name:'Cash box',type:'cash',opening_minor:50000},{id:'a2',school_id:SCH,name:'GCB Bank',type:'bank',opening_minor:1000000});
 T.method_accounts.push({school_id:SCH,method:'Cash',account_id:'a1'},{school_id:SCH,method:'Bank Transfer',account_id:'a2'},{school_id:SCH,method:'Mobile Money',account_id:'a2'},{school_id:SCH,method:'Cheque',account_id:'a2'});
 T.expenses.push({id:'e1',school_id:SCH,description:'Electricity bill',category:'Electricity',amount_minor:42000,paid_on:day(NOW-5*DAY),account_id:'a2',method:'Bank Transfer',recipient:'ECG',status:'approved',created_at:iso(NOW-5*DAY)},{id:'e2',school_id:SCH,description:'Chalk and markers',category:'Stationery',amount_minor:9000,paid_on:day(NOW-1*DAY),account_id:'a1',method:'Cash',recipient:'Kantamanto',status:'pending',created_at:iso(NOW-1*DAY)});
 T.suppliers.push({id:'su1',school_id:SCH,name:'Fresh Foods Ltd',phone:'0200000000'});T.supplier_txns.push({id:'st1',school_id:SCH,supplier_id:'su1',kind:'purchase',amount_minor:120000,paid_on:day(NOW-8*DAY)});
 T.budgets.push({school_id:SCH,academic_year:'2026/2027',kind:'income',category:'Tuition',amount_minor:5000000},{school_id:SCH,academic_year:'2026/2027',kind:'expense',category:'Electricity',amount_minor:300000});
 T.sms_templates.push({id:'tp1',school_id:SCH,name:'Final notice',body:'Dear Parent, final notice: [Student Name] owes GHS [Amount]. [School Name]'});
 var STAFF=[{user_id:ME,email:'owner@brightfuture.edu.gh',role:'proprietor',active:true},{user_id:'u2',email:'accountant@brightfuture.edu.gh',role:'accountant',active:true}];
 var MEM=null;if(window.__NEWSCHOOL){['students','fee_items','payments','expenses','accounts','method_accounts','budgets','suppliers','supplier_txns','sms_templates','sms_usage','academic_years','terms'].forEach(function(k){T[k]=[]});MEM=T.school_members.splice(0);T.schools[0].name='New School'}
 var LOG=window.__LOG=[]; var session=null, listeners=[];
 try{session={user:{id:ME,email:'demo@feepilot.app'}}}catch(e){}
 function bal(){return T.fee_items.map(function(f){var paid=T.payments.filter(function(p){return p.fee_item_id===f.id}).reduce(function(t,p){return t+p.amount_minor},0);return Object.assign({},f,{fee_item_id:f.id,paid_minor:paid,balance_minor:f.carried_to?0:f.amount_minor-paid})})}
 function view(name){
  if(name==='fee_balances')return bal();
  if(name==='account_balances')return T.accounts.map(function(a){var inc=T.cashbook.filter(function(c){return c.account_id===a.id}).reduce(function(t,c){return t+c.income_minor-c.expense_minor},0);return {account_id:a.id,balance_minor:a.opening_minor+inc+T.payments.filter(function(p){return (T.method_accounts.find(function(m){return m.method===p.method})||{}).account_id===a.id}).reduce(function(t,p){return t+p.amount_minor},0)-T.expenses.filter(function(e){return e.account_id===a.id&&e.status==='approved'}).reduce(function(t,e){return t+e.amount_minor},0)}});
  if(name==='cashbook'){var rows=[];T.payments.forEach(function(p){var m=T.method_accounts.find(function(x){return x.method===p.method});if(m)rows.push({id:'c'+p.id,school_id:SCH,account_id:m.account_id,entry_date:p.occurred_at.slice(0,10),entry_ts:p.occurred_at,description:'Fee payment '+p.receipt_no,income_minor:p.amount_minor,expense_minor:0})});T.expenses.filter(function(e){return e.status==='approved'}).forEach(function(e){rows.push({id:'c'+e.id,school_id:SCH,account_id:e.account_id,entry_date:e.paid_on,entry_ts:e.created_at,description:e.description,income_minor:0,expense_minor:e.amount_minor})});T.cashbook.forEach(function(c){rows.push(c)});rows.sort(function(a,b){return a.entry_ts<b.entry_ts?-1:1});var run={};rows.forEach(function(r){run[r.account_id]=(run[r.account_id]||(T.accounts.find(function(a){return a.id===r.account_id})||{}).opening_minor||0)+r.income_minor-r.expense_minor;r.balance_minor=run[r.account_id]});return rows}
  if(name==='budget_actuals')return T.budgets.map(function(b){return Object.assign({},b,{budget_minor:b.amount_minor,actual_minor:b.kind==='income'?T.payments.reduce(function(t,p){return t+p.amount_minor},0):T.expenses.filter(function(e){return e.status==='approved'&&e.category===b.category}).reduce(function(t,e){return t+e.amount_minor},0)})});
  if(name==='supplier_balances')return T.suppliers.map(function(s){return {supplier_id:s.id,name:s.name,balance_minor:T.supplier_txns.filter(function(x){return x.supplier_id===s.id}).reduce(function(t,x){return t+(x.kind==='purchase'?x.amount_minor:-x.amount_minor)},0)}});
  if(name==='dashboard_totals'){var f=bal(),p=T.payments,td=day(NOW),mo=td.slice(0,7);var exp=f.reduce(function(t,x){return t+x.amount_minor},0),col=f.reduce(function(t,x){return t+x.paid_minor},0);var ow={};f.forEach(function(x){if(x.balance_minor>0)ow[x.student_id]=1});return [{school_id:SCH,expected_minor:exp,collected_minor:col,outstanding_minor:exp-col,today_minor:p.filter(function(x){return x.occurred_at.slice(0,10)===td}).reduce(function(t,x){return t+x.amount_minor},0),month_minor:p.filter(function(x){return x.occurred_at.slice(0,7)===mo}).reduce(function(t,x){return t+x.amount_minor},0),expenses_month_minor:51000,students:T.students.length,owing:Object.keys(ow).length,overdue:6}]}
  if(name==='dash_class'){var m={};bal().forEach(function(x){var c=T.students.find(function(s){return s.id===x.student_id}).class_name;m[c]=(m[c]||0)+x.balance_minor});return Object.keys(m).map(function(k){return {school_id:SCH,class_name:k,balance_minor:m[k]}})}
  if(name==='dash_method'){var m2={};T.payments.forEach(function(x){m2[x.method]=(m2[x.method]||0)+x.amount_minor});return Object.keys(m2).map(function(k){return {school_id:SCH,method:k,total_minor:m2[k]}})}
  if(name==='subscriptions')return T.subscriptions.map(function(s){return Object.assign({},s,{plans:T.plans[0]})});
  if(name==='school_members')return T.school_members.map(function(m){return Object.assign({},m,{schools:T.schools[0]})});
  return (T[name]||[]).map(function(x){return x});
 }
 function Q(name){
  var q={op:'select',f:[],order:[],lim:null,rng:null,pl:null,single:false,conf:null,ign:false};
  var api={select:function(){return api},insert:function(p){q.op='insert';q.pl=p;return api},update:function(p){q.op='update';q.pl=p;return api},upsert:function(p,o){q.op='upsert';q.pl=p;q.conf=o&&o.onConflict;q.ign=o&&o.ignoreDuplicates;return api},delete:function(){q.op='delete';return api},
   eq:function(c,v){q.f.push(function(r){return String(r[c])===String(v)});return api},neq:function(c,v){q.f.push(function(r){return String(r[c])!==String(v)});return api},
   gte:function(c,v){q.f.push(function(r){return String(r[c])>=String(v)});return api},lte:function(c,v){q.f.push(function(r){return String(r[c])<=String(v)});return api},
   in:function(c,a){q.f.push(function(r){return a.indexOf(r[c])>=0});return api},is:function(c,v){q.f.push(function(r){return r[c]===v});return api},
   order:function(c,o){q.order.push([c,!(o&&o.ascending===false)]);return api},limit:function(n){q.lim=n;return api},range:function(a,b){q.rng=[a,b];return api},
   maybeSingle:function(){q.single=true;return api},single:function(){q.single=true;return api},
   then:function(a,b){return new Promise(function(res){setTimeout(function(){var out;try{out=run()}catch(e){out={data:null,error:{message:e.message}}}res(out)},3)}).then(a,b)}};
  function run(){
   if(window.__NETFAIL)return {data:null,error:{message:'Network error: Failed to fetch'}};
   if(!session)return {data:[],error:null};
   if(q.op==='select'){var rows=view(name).filter(function(r){return q.f.every(function(f){return f(r)})});
    q.order.slice().reverse().forEach(function(o){rows.sort(function(a,b){var x=a[o[0]],y=b[o[0]];return (x<y?-1:x>y?1:0)*(o[1]?1:-1)})});
    if(q.rng)rows=rows.slice(q.rng[0],q.rng[1]+1);if(q.lim)rows=rows.slice(0,q.lim);
    rows=JSON.parse(JSON.stringify(rows));return {data:q.single?(rows[0]||null):rows,error:null}}
   var tab=T[name];if(!tab)return {data:null,error:{message:'unknown table '+name}};
   var arr=[].concat(q.pl||[]);
   if(q.op==='insert'||q.op==='upsert'){arr.forEach(function(r){r=Object.assign({id:uid(),created_at:iso(Date.now())},r);
     if(name==='students'){var dup=tab.find(function(s){return s.student_no===r.student_no});if(dup){if(q.op==='upsert'&&q.ign)return;throw new Error('duplicate key value violates unique constraint "students_school_id_student_no_key"')}r.status=r.status||'active'}
     if(q.op==='upsert'&&q.conf){var ks=q.conf.split(',');var ex=tab.find(function(t){return ks.every(function(k){return t[k]===r[k]})});if(ex){if(!q.ign)Object.assign(ex,r);return}}
     tab.push(r)});LOG.push([q.op,name,arr.length]);return {data:arr,error:null}}
   if(q.op==='update'){tab.filter(function(r){return q.f.every(function(f){return f(r)})}).forEach(function(r){Object.assign(r,q.pl)});LOG.push(['update',name]);return {data:null,error:null}}
   if(q.op==='delete'){T[name]=tab.filter(function(r){return !q.f.every(function(f){return f(r)})});return {data:null,error:null}}
  }
  return api}
 function rpc(n,a){return new Promise(function(res){setTimeout(function(){res(rpc0(n,a||{}))},4)})}
 function rpc0(n,a){if(window.__NETFAIL)return {data:null,error:{message:'Network error: Failed to fetch'}};LOG.push(['rpc',n]);
  if(n==='is_platform_admin')return {data:window.__ADMIN===true,error:null};
  if(n==='accept_invites')return {data:0,error:null};
  if(n==='my_schools')return {data:MEM?[]:[{id:SCH,status:'active'}],error:null};
  if(n==='list_staff')return {data:STAFF,error:null};
  if(n==='list_join_info'){return {data:(window.__CODES||[]).filter(function(c){return !c.used}).map(function(c){return {kind:'code',user_id:null,name:c.name,role:c.role,code:c.code,expires_at:'2026-11-25T00:00:00Z'}}),error:null}}
  if(n==='create_join_code'){window.__CODES=window.__CODES||[];var cd='K7M2QX4R'.slice(0,7)+String(window.__CODES.length);window.__CODES.push({code:cd,name:a.p_name,role:a.p_role});return {data:cd,error:null}}
  if(n==='join_with_code'){var k=(window.__CODES||[]).find(function(c){return !c.used&&c.code===String(a.p_code).toUpperCase().replace(/[^A-Z0-9]/g,'')});if(!k)return {data:null,error:{message:'That code is not valid. Check it, or ask for a new one.'}};k.used=true;T.school_members.forEach(function(m){m.role=k.role});window.__JOINED=k;return {data:SCH,error:null}}
  if(n==='cancel_join_code'){window.__CODES=(window.__CODES||[]).filter(function(c){return c.code!==a.p_code});return {data:null,error:null}}
  if(n==='log_report'||n==='invite_staff'||n==='set_staff'||n==='create_school'){if(n==='create_school'&&MEM){T.schools[0].name=a.p_name;T.school_members.push.apply(T.school_members,MEM);MEM=null;return {data:SCH,error:null}}return {data:true,error:null}}
  if(n==='verify_receipt'){var p=T.payments.find(function(x){return x.receipt_no===a.p_receipt});return {data:p?[{school:T.schools[0].name,receipt_no:p.receipt_no,amount_minor:p.amount_minor,paid_on:p.occurred_at,reversed:false}]:[],error:null}}
  if(n==='record_payment'){var f=T.fee_items.find(function(x){return x.id===a.p_fee_item});if(!f)return {data:null,error:{message:'fee not found'}};var ex=T.payments.find(function(x){return x.id===a.p_id});if(ex)return {data:ex,error:null};var b=bal().find(function(x){return x.fee_item_id===f.id}).balance_minor;if(a.p_amount>b)return {data:null,error:{message:'Payment exceeds outstanding balance'}};var rn='FP-2026-'+String(T.payments.length+1).padStart(6,'0');var p={id:a.p_id,school_id:SCH,fee_item_id:f.id,student_id:f.student_id,amount_minor:a.p_amount,method:a.p_method,reference:a.p_ref,receipt_no:rn,occurred_at:a.p_occurred||iso(Date.now()),created_at:iso(Date.now()),recorded_by:ME,reversal_of:null};T.payments.push(p);return {data:p,error:null}}
  if(n==='reverse_payment'){var o=T.payments.find(function(x){return x.id===a.p_id});T.payments.push(Object.assign({},o,{id:a.p_reverse_id,amount_minor:-o.amount_minor,receipt_no:null,reversal_of:o.id,created_at:iso(Date.now())}));return {data:true,error:null}}
  if(n==='queue_reminders'){var c=0;(a.p_students||[]).forEach(function(id){var s=T.students.find(function(x){return x.id===id});if(s&&s.guardian_phone&&!s.sms_opt_out){c++;T.sms_messages.push({id:uid(),student_id:id,kind:'reminder',status:'queued',created_at:iso(Date.now())})}});return {data:c,error:null}}
  if(n==='queue_sms'){T.sms_messages.push({id:uid(),student_id:a.p_student,kind:a.p_kind,status:'queued',created_at:iso(Date.now())});return {data:true,error:null}}
  if(n==='create_sms_schedule'){T.sms_schedules.push({id:uid(),name:a.p_name,dow:a.p_dow,hour:a.p_hour,class_name:a.p_class,active:true,next_run_at:iso(NOW+3*DAY)});return {data:true,error:null}}
  if(n==='approve_expense'){var e=T.expenses.find(function(x){return x.id===a.p_id});e.status=a.p_approve?'approved':'rejected';return {data:true,error:null}}
  if(n==='add_account_txn'){T.cashbook.push({id:uid(),school_id:SCH,account_id:a.p_account,entry_date:a.p_date,entry_ts:iso(Date.now()),description:a.p_desc||a.p_kind,income_minor:a.p_kind==='deposit'?a.p_amount:0,expense_minor:a.p_kind==='withdrawal'?a.p_amount:0});return {data:true,error:null}}
  if(n==='transfer_funds'){var t=iso(Date.now());T.cashbook.push({id:uid(),school_id:SCH,account_id:a.p_from,entry_date:a.p_date,entry_ts:t,description:'Transfer out',income_minor:0,expense_minor:a.p_amount},{id:uid(),school_id:SCH,account_id:a.p_to,entry_date:a.p_date,entry_ts:t,description:'Transfer in',income_minor:a.p_amount,expense_minor:0});return {data:true,error:null}}
  if(n==='carry_forward')return {data:0,error:null};
  if(n==='is_platform_admin')return {data:!!window.__PADMIN,error:null};
  if(n==='platform_schools')return {data:[{id:SCH,name:'Bright Future Academy',code:'FP1234',status:window.__PSUSP?'suspended':'active',plan_name:'Standard',sub_status:'trial',trial_ends_at:iso(NOW+3*DAY),renews_on:null,students:12,staff:2},{id:'sch2',name:'Old School',code:'FP9999',status:'active',plan_name:'Standard',sub_status:'active',trial_ends_at:null,renews_on:'2026-01-01',students:40,staff:3}],error:null};
  if(n==='platform_billing')return {data:[{id:'b1',school:'Old School',amount_minor:25000,reference:'MoMo1',period_start:'2025-12-01',period_end:'2026-01-01',note:null,created_at:'2025-12-01T10:00:00Z'}],error:null};
  if(n==='platform_set_status'){window.__PSUSP=a.p_status==='suspended';window.__PCALL=[n,a];return {data:null,error:null}}
  if(n==='platform_record_payment'||n==='platform_set_subscription'||n==='platform_upsert_plan'){window.__PCALL=[n,a];return {data:null,error:null}}
  return {data:null,error:{message:'rpc '+n+' not faked'}}}
 var client={auth:{
   onAuthStateChange:function(cb){listeners.push(cb);return {data:{subscription:{unsubscribe:function(){}}}}},
   getSession:async function(){return {data:{session:session}}},
   signInWithPassword:async function(o){if(o.password==='wrong')return {data:{},error:{message:'Invalid login credentials'}};session={user:{id:ME,email:o.email}};return {data:{session:session,user:session.user},error:null}},
   signUp:async function(o){session={user:{id:ME,email:o.email}};return {data:{session:session,user:session.user},error:null}},
   signInAnonymously:async function(){session={user:{id:ME,email:null,is_anonymous:true}};return {data:{session:session,user:session.user},error:null}},
   resetPasswordForEmail:async function(e,o){window.__RESET=[e,o];return {data:{},error:null}},updateUser:async function(o){window.__NEWPW=o.password;return {data:{user:session&&session.user},error:null}},signOut:async function(){location.href='../app/#signup';return {error:null}}},
  from:Q,rpc:rpc,
  storage:{from:function(){return {upload:async function(){return {error:null}},getPublicUrl:function(){return {data:{publicUrl:''}}},createSignedUrl:async function(){return {data:{signedUrl:PX},error:null}},createSignedUrls:async function(l){return {data:l.map(function(p){return {path:p,signedUrl:PX}}),error:null}}}}},
  functions:{invoke:async function(){return {data:{answer:'Basic 3B owes the most.'},error:null}}}};
 window.supabase={createClient:function(){return client}};window.sbLite=client; window.__T=T;
})();
