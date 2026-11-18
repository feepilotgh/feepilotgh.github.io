'use strict';
const sb=window.sbLite||null,E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fm=p=>'GH₵ '+String(Math.floor(p/100)).replace(/\B(?=(\d{3})+$)/g,',')+'.'+String(p%100).padStart(2,'0');
const rw=(a,b)=>'<div class="row"><span class="m">'+a+'</span><span class="v">'+b+'</span></div>';
async function check(){const n=document.getElementById('n').value.trim(),o=document.getElementById('o');if(!n)return;if(!sb){o.innerHTML='<div class="card err">Could not load. Refresh and try again.</div>';return}
 o.innerHTML='<div class="card m">Checking…</div>';const r=await sb.rpc('verify_receipt',{p_receipt:n});
 if(r.error){o.innerHTML='<div class="card err">Could not verify right now. Check your connection.</div>';return}
 const d=r.data&&r.data[0];o.innerHTML=d?'<div class="card"><div class="big '+(d.reversed?'err':'ok')+'">'+(d.reversed?'Found, but this payment was REVERSED':'✓ Valid receipt')+'</div>'+rw('School',E(d.school))+rw('Receipt',E(d.receipt_no))+rw('Amount',fm(d.amount_minor))+rw('Date',new Date(d.paid_on).toLocaleString('en-GB',{timeZone:'Africa/Accra'}))+'</div>':'<div class="card"><b>No receipt found with that number.</b><div class="m">Check the number and try again.</div></div>'}
document.getElementById('go').onclick=check;document.getElementById('n').onkeydown=e=>{if(e.key==='Enter')check()};
const q=new URLSearchParams(location.search).get('r');if(q){document.getElementById('n').value=q;check()}
