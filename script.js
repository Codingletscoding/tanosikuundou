        // 1. \u9396\u5b9a\u6ed1\u9f20\u53f3\u9375\uff08\u9632\u6b62\u9ede\u64ca\u300c\u6aa2\u67e5\u300d\u6216\u300c\u6aa2\u8996\u7db2\u9801\u539f\u59cb\u78bc\u300d\uff09
        document.addEventListener('contextmenu', function (e) {
            e.preventDefault();
        });
        
        // 2. \u9396\u5b9a\u958b\u767c\u8005\u5de5\u5177\u5e38\u7528\u7684\u9375\u76e4\u5feb\u6377\u9375
        document.addEventListener('keydown', function (e) {
            // \u9396\u5b9a F12
            if (e.key === 'F12' || e.keyCode === 123) {
                e.preventDefault();
            }
            // \u9396\u5b9a Ctrl+Shift+I (Windows) / Cmd+Option+I (Mac) - \u958b\u555f\u958b\u767c\u4eba\u54e1\u5de5\u5177
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i')) {
                e.preventDefault();
            }
            // \u9396\u5b9a Ctrl+Shift+J (Windows) / Cmd+Option+J (Mac) - \u958b\u555f\u4e3b\u63a7\u53f0
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'J' || e.key === 'j')) {
                e.preventDefault();
            }
            // \u9396\u5b9a Ctrl+U (Windows) / Cmd+Option+U (Mac) - \u6aa2\u8996\u7db2\u9801\u539f\u59cb\u78bc
            if ((e.ctrlKey || e.metaKey) && (e.key === 'U' || e.key === 'u')) {
                e.preventDefault();
            }
        });
        const { useState, useEffect } = React;

        // ==========================================
        // \ud83d\udd39 \u57fa\u672c\u8a2d\u5b9a\u8207\u5e38\u6578
        // ==========================================
        const API_URL = 'https://script.google.com/macros/s/AKfycbzEgH-9zNLvzhNzsZISAc6a3IY4ojbMhpYDUPOgkFElBt1pqTYhJINyaezPfEjMlo9KLA/exec';
        const LIFF_ID = '2012115245-A7HBSYsv';

        const LEVEL_NAMES = { 1: '\u666e\u901a', 2: 'VIP', 3: 'VVIP', 4: 'SVVIP', 5: 'GVIP' };
        
        const SKILL_KEYS = [
            { key: 'clears', label: '\u9ad8\u9060\u7403' }, { key: 'drives', label: '\u5e73\u62bd' },
            { key: 'lifts', label: '\u6311\u7403' }, { key: 'drops', label: '\u5207\u7403' },
            { key: 'net', label: '\u7db2\u524d\u5c0f\u7403' }, { key: 'pushes', label: '\u64b2\u7403' },
            { key: 'smashes', label: '\u6bba\u7403' }, { key: 'defense', label: '\u9632\u5b88\u6280\u8853' },
            { key: 'combo', label: '\u7d44\u5408\u8a13\u7df4' }
        ];

        const TRAINING_STEP_MINUTES = 5;
        const TRAINING_REPETITIONS_PER_STEP = 40;
        const normalizeTrainingMinutes = value => {
            const minutes = Number(value);
            if (!Number.isFinite(minutes)) return 0;
            return Math.min(120, Math.max(0, Math.round(minutes / TRAINING_STEP_MINUTES) * TRAINING_STEP_MINUTES));
        };
        const estimateTrainingRepetitions = hours => {
            const duration = Number(hours);
            return Number.isFinite(duration) && duration > 0 ? Math.round(duration * 60 / TRAINING_STEP_MINUTES * TRAINING_REPETITIONS_PER_STEP) : 0;
        };

        const LOCATIONS_LIST = ['\u95dc\u8056\u91cc\u6d3b\u52d5\u4e2d\u5fc3', '\u4e2d\u611b\u7fbd\u7403\u9928', '\u6c38\u5eb7\u5609\u4e16','\u6c38\u5eb7\u9a30\u8000', '\u83ef\u4e2d\u7fbd\u7403\u9928', '\u4ec1\u5fb7\u7fbd\u6f6e','\u5357\u5340\u7fbd\u6f6e', '\u5176\u4ed6\u5834\u5730(\u9700instagram\u79c1\u8a0a\u78ba\u8a8d)'];

        // ==========================================
        // \ud83d\udd39 \u5171\u7528\u529f\u80fd\u8207 API
        // ==========================================
        const generateTimeOptions = () => {
            const times = [];
            for (let h = 6; h <= 23; h++) {
                const hour = h.toString().padStart(2, '0');
                times.push(`${hour}:00`, `${hour}:30`);
            }
            return times;
        };
        const timeOptions = generateTimeOptions();

        const formatDate = (dateObj) => {
            if (!dateObj) return '';
            const y = dateObj.getFullYear();
            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
            const d = String(dateObj.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };

        const formatTrainingDate = value => {
            const text = String(value || '').trim();
            // Sheet dates arrive as UTC timestamps; display their calendar day in Taiwan.
            if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(text)) return text;
            const date = new Date(text);
            if (!Number.isFinite(date.getTime())) return text;
            const parts = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
            }).formatToParts(date);
            const part = type => parts.find(item => item.type === type).value;
            return `${part('year')}-${part('month')}-${part('day')}`;
        };

        const getDayOfWeek = (dateString) => {
            if (!dateString) return '';
            const days = ['\u9031\u65e5', '\u9031\u4e00', '\u9031\u4e8c', '\u9031\u4e09', '\u9031\u56db', '\u9031\u4e94', '\u9031\u516d'];
            return days[new Date(dateString).getDay()];
        };

        const getMonthlyDatesInfo = (startDateStr) => {
            if (!startDateStr) return { text: '', count: 0 };
            const d = new Date(startDateStr);
            const year = d.getFullYear();
            const month = d.getMonth();
            const targetDayOfWeek = d.getDay(); 
            const dates = [];
            for (let day = 1; day <= 31; day++) {
                const tempDate = new Date(year, month, day);
                if (tempDate.getMonth() !== month) break; 
                if (tempDate.getDay() === targetDayOfWeek) dates.push(`${tempDate.getMonth() + 1}/${tempDate.getDate()}`);
            }
            return { text: `${dates.join(', ')} (${getDayOfWeek(startDateStr)})`, count: dates.length };
        };

        const doesSlotMatchDate = (slot, dateStr) => {
            if (!slot || !slot.date || !dateStr) return false;
            const sDate = String(slot.date);
            if (sDate.includes(dateStr)) return true;
            if (sDate.includes('T') && sDate.includes('Z')) {
                const dObj = new Date(sDate);
                if (formatDate(dObj) === dateStr) return true;
            }
            const target = new Date(dateStr);
            const m = target.getMonth() + 1;
            const d = target.getDate();
            const reg = new RegExp(`(^|[^\\d/])(0?${m}/0?${d})([^\\d/]|$)`);
            if (reg.test(sDate)) return true;
            return false;
        };

        const fetchAPI = async (payload) => {
          try {
              const accessToken = typeof liff !== 'undefined' ? liff.getAccessToken() : null;
              if (!accessToken) return { status: 'error', message: '\u8acb\u91cd\u65b0\u767b\u5165 LINE\u3002' };
              if (window.BadmintonI18n) window.BadmintonI18n.remember(payload);
              const res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ ...payload, accessToken })
              });
              const result = await res.json();
              if (result.securityVersion !== 2) return { status: 'error', message: '\u5f8c\u7aef\u5c1a\u672a\u652f\u63f4\u5b89\u5168\u9a57\u8b49\u8207\u5831\u50f9\uff0c\u8acb\u806f\u7d61\u7ba1\u7406\u54e1\u66f4\u65b0\u7cfb\u7d71\u3002' };
              if (window.BadmintonI18n) window.BadmintonI18n.remember(result);
              return result;
          } catch (err) {
              return { status: 'error', message: '\u670d\u52d9\u66ab\u6642\u7121\u6cd5\u9023\u7dda\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002' };
          }
        };

        // ==========================================
        // \ud83d\udd39 \u7368\u7acb UI \u57fa\u790e\u5143\u4ef6
        // ==========================================
        
        const CircleProgress = ({ label, value }) => {
            const max = 20; 
            const radius = 32;
            const circumference = 2 * Math.PI * radius;
            const safeValue = Math.min(Number(value) || 0, max);
            const strokeDashoffset = circumference - (safeValue / max) * circumference;
            
            return (
                <div className="min-w-0 flex flex-col items-center justify-center p-1 sm:p-2">
                    <div className="relative w-full max-w-[80px] aspect-square flex items-center justify-center">
                        <svg viewBox="0 0 80 80" className="w-full h-auto transform -rotate-90">
                            <circle cx="40" cy="40" r="32" stroke="#e2e8f0" strokeWidth="6" fill="transparent" />
                            <circle cx="40" cy="40" r="32" stroke="#10b981" strokeWidth="6" fill="transparent" 
                                strokeDasharray={circumference} 
                                strokeDashoffset={strokeDashoffset} 
                                className="transition-all duration-1000 ease-out" 
                            />
                        </svg>
                        <div className="absolute flex flex-col items-center justify-center">
                            <span className="text-sm font-bold text-slate-700" title={`${Math.round((Number(value) || 0) * 60)} \u5206\u9418`}>{Number((Number(value) || 0).toFixed(2))}</span>
                            <span className="text-[9px] text-slate-400">&#x6642;&#x6578;</span>
                        </div>
                    </div>
                    <span className="text-xs mt-2 font-bold text-slate-600 text-center leading-tight">{label}</span>
                    <span className="text-xs mt-1 text-emerald-700 text-center tabular-nums">{`\u7d04 ${estimateTrainingRepetitions(value)} \u6b21`}</span>
                </div>
            );
        };

        const BookingStatusItem = ({ booking, onUpdate }) => {
            const [code, setCode] = useState(booking.paymentCode || '');
            const [updating, setUpdating] = useState(false);

            const handleUpdate = async () => {
                if(!code || code.length < 5) return alert("\u8acb\u8f38\u5165\u5b8c\u6574\u7684\u5e33\u865f\u5f8c5\u78bc\uff01");
                setUpdating(true);
                const result = await fetchAPI({ action: 'updatePayment', bookingId: booking.bookingId, paymentCode: code });
                if (result.status !== 'success') { setUpdating(false); alert(result.message || '\u66f4\u65b0\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002'); return; }
                alert("\u5e33\u865f\u5f8c5\u78bc\u5df2\u6210\u529f\u66f4\u65b0\uff01\u8acb\u7b49\u5f85\u6559\u7df4\u5be9\u6838\u3002");
                setUpdating(false);
                if (onUpdate) onUpdate();
            };

            const isApproved = booking.status === '\u9810\u7d04\u6210\u529f';
            const isCash = ['\u73fe\u5834\u73fe\u91d1', '\u73fe\u91d1\u5df2\u6536'].includes(booking.paymentCode) || /^\[\u5c08\u5c6c\u6559\u7df4\u8ab2\]/.test(booking.slotTitle || '');
            const isCancelled = booking.status === '\u5df2\u53d6\u6d88';

            return (
                <div className={`border p-4 md:p-5 rounded-xl flex flex-col shadow-sm relative overflow-hidden ${isApproved ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                    {isCancelled ? <div className="text-gray-500 font-bold mb-2">&#x9810;&#x7d04;&#x5df2;&#x53d6;&#x6d88;</div> : isApproved ? (
                        <div className="absolute top-0 right-0 bg-emerald-200 text-emerald-800 text-[10px] px-3 py-1 rounded-bl-lg font-bold">&#x9810;&#x7d04;&#x6210;&#x529f;</div>
                    ) : (
                        <div className="absolute top-0 right-0 bg-amber-200 text-amber-800 text-[10px] px-3 py-1 rounded-bl-lg font-bold animate-pulse">&#x5be9;&#x6838;&#x4e2d;</div>
                    )}
                    
                    <div className="pr-14">
                        <div className={`font-bold text-base md:text-lg ${isApproved ? 'text-emerald-800' : 'text-amber-800'}`}>
                            {booking.slotTitle || '\u672a\u77e5\u8ab2\u7a0b'}
                        </div>
                        <div className="text-xs md:text-sm text-gray-500 mt-1">
                            {booking.slotDate || ''} {booking.slotTime || ''}
                        </div>
                    </div>

                    {isCash && <p className="text-sm text-amber-900 mt-3">{booking.paymentCode === '\u73fe\u91d1\u5df2\u6536' ? '\u73fe\u91d1\u5df2\u6536\u6b3e' : '\u4ed8\u6b3e\u65b9\u5f0f\uff1a\u73fe\u5834\u73fe\u91d1\u4ed8\u6b3e\uff08\u6559\u7df4\u8cbb\u4e0d\u542b\u5834\u5730\u8cbb\uff09'}</p>}
                    {!isCash && !isApproved && !isCancelled && booking.bookingId && (
                        <div className="mt-4 pt-3 border-t border-amber-200/50 flex items-center gap-2">
                            <input 
                                type="text" 
                                placeholder="&#x8acb;&#x8f38;&#x5165;&#x532f;&#x6b3e;&#x5f8c;5&#x78bc;" 
                                maxLength="5"
                                value={code} 
                                onChange={e=>setCode(e.target.value.replace(/\D/g, ''))} 
                                className="flex-1 min-w-0 border border-amber-200 bg-white rounded-lg p-2 md:p-2.5 text-sm md:text-base outline-none focus:ring-1 focus:ring-amber-500 font-mono transition"
                            />
                            <button 
                                onClick={handleUpdate} 
                                disabled={updating || (code === booking.paymentCode && code !== '')} 
                                className="bg-amber-600 text-white px-4 py-2 md:py-2.5 rounded-lg text-sm font-bold active:scale-95 transition disabled:opacity-50 whitespace-nowrap"
                            >
                                {updating ? '\u66f4\u65b0\u4e2d' : (booking.paymentCode ? '\u4fee\u6539' : '\u88dc\u767b')}
                            </button>
                        </div>
                    )}
                </div>
            );
        };

        const LogFormModal = ({ targetData, onClose, onSuccess }) => {
            const [date, setDate] = useState(formatDate(new Date()));
            const [note, setNote] = useState('');
            const [submitting, setSubmitting] = useState(false);
            
            const [stats, setStats] = useState({
                clears: 0, drives: 0, lifts: 0, drops: 0, net: 0, pushes: 0, smashes: 0, defense: 0, combo: 0
            });

            const handleStatChange = (key, val) => {
                const minutes = normalizeTrainingMinutes(val);
                setStats(prev => ({ ...prev, [key]: minutes }));
            };

            const handleSubmit = async (e) => {
                e.preventDefault();
                setSubmitting(true);
                const result = await fetchAPI({
                    action: 'addLog', 
                    lineId: targetData.lineId,
                    studentId: targetData.studentId || '',
                    name: targetData.name, 
                    bookingId: targetData.bookingId || "", 
                    date: date, 
                    stats: Object.fromEntries(Object.entries(stats).map(([key, minutes]) => [key, minutes / 60])),
                    note: note 
                });
                if (result.status !== 'success') { setSubmitting(false); alert(result.message || '\u65e5\u8a8c\u5132\u5b58\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002'); return; }
                alert('\u65e5\u8a8c\u5132\u5b58\u6210\u529f\uff01' + (targetData.bookingId ? ' \u8a72\u9810\u7d04\u55ae\u5df2\u9806\u5229\u7d50\u6848\u3002' : ''));
                setSubmitting(false);
                if(onSuccess) onSuccess();
                onClose();
            };

            return (
                <div className="fixed inset-0 bg-slate-900 bg-opacity-60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden my-auto max-h-[90dvh] flex flex-col">
                        <div className="bg-slate-800 p-4 md:p-5 text-white flex gap-3 justify-between items-center shrink-0">
                            <h3 className="font-bold text-base md:text-lg">&#x8a13;&#x7df4;&#x65e5;&#x8a8c;&#xff1a;{targetData.name || '\u5b78\u54e1'}</h3>
                            <button onClick={onClose} className="text-slate-400 hover:text-white font-bold text-3xl px-2 shrink-0 leading-none active:scale-90">&times;</button>
                        </div>
                        
                        <form onSubmit={handleSubmit} className="p-4 md:p-6 overflow-y-auto">
                            <div className="mb-5">
                                <label className="block text-sm font-bold text-slate-700 mb-2">&#x672c;&#x6b21;&#x4e0a;&#x8ab2;&#x65e5;&#x671f;</label>
                                <input type="date" required className="border border-gray-300 p-2.5 rounded-lg w-full md:max-w-xs text-base" value={date} onChange={e=>setDate(e.target.value)} />
                            </div>

                            <div className="mb-5">
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-4 border-b pb-3 gap-2">
                                    <label className="block text-sm md:text-base font-bold text-slate-700">&#x8a13;&#x7df4;&#x6642;&#x6578;</label>
                                    <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded w-fit font-bold">&#x6bcf;&#x683c; 5 &#x5206;&#x9418;&#xff08;&#x7d04; 40 &#x6b21;&#xff09;&#xff0c;&#x6bcf;&#x9805;&#x6700;&#x591a; 2 &#x5c0f;&#x6642;</span>
                                </div>
                                <div className="grid grid-cols-1 min-[360px]:grid-cols-2 md:grid-cols-3 gap-3 md:gap-x-6 md:gap-y-5">
                                    {SKILL_KEYS.map(skill => (
                                        <div key={skill.key} className="flex flex-col bg-slate-50 p-3 md:p-4 rounded-xl border border-slate-100">
                                            <div className="flex flex-wrap gap-1 justify-between text-sm md:text-base font-bold text-slate-700 mb-2.5">
                                                <span>{skill.label}</span>
                                                <span className={stats[skill.key] > 0 ? "text-emerald-600 font-extrabold" : "text-slate-400"}>{stats[skill.key]} &#x5206;&#x9418;</span>
                                            </div>
                                            <input type="range" aria-label={`${skill.label}\u8a13\u7df4\u5206\u9418`} aria-valuetext={`${stats[skill.key]} \u5206\u9418\uff0c\u7d04 ${estimateTrainingRepetitions(stats[skill.key] / 60)} \u6b21`} min="0" max="120" step={TRAINING_STEP_MINUTES} value={stats[skill.key]} onChange={e => handleStatChange(skill.key, e.target.value)} className="w-full accent-emerald-500" />
                                            <p className="text-xs text-emerald-700 mt-2 tabular-nums">{`\u7d04 ${estimateTrainingRepetitions(stats[skill.key] / 60)} \u6b21`}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="mb-4">
                                <label className="block text-sm md:text-base font-bold text-slate-700 mb-2">&#x6559;&#x7df4;&#x7d9c;&#x5408;&#x77ed;&#x8a55; (&#x65e5;&#x8a8c;)</label>
                                <textarea className="w-full border border-gray-300 p-4 rounded-xl h-28 text-base outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 leading-relaxed" placeholder="&#x4f8b;&#x5982;&#xff1a;&#x767c;&#x529b;&#x660e;&#x986f;&#x9032;&#x6b65;&#xff0c;&#x4f46;&#x9632;&#x5b88;&#x6b65;&#x4f10;&#x9700;&#x8981;&#x52a0;&#x5f37;..." value={note} onChange={e=>setNote(e.target.value)}></textarea>
                            </div>

                            <div className="flex justify-end gap-3 pt-5 border-t mt-auto">
                                <button type="button" onClick={onClose} className="px-5 py-2.5 font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 text-sm md:text-base active:scale-95 transition">&#x53d6;&#x6d88;</button>
                                <button type="submit" disabled={submitting} className="px-5 py-2.5 font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm disabled:opacity-50 text-sm md:text-base active:scale-95 transition">
                                    {submitting ? '\u5132\u5b58\u4e2d...' : (targetData.bookingId ? '\u9001\u51fa\u65e5\u8a8c\u4e26\u7d50\u6848' : '\u9001\u51fa\u65e5\u8a8c')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )
        };

        const StudentRegistrationDetails = ({ profile }) => {
            const birthday = profile.birthDate || (profile.age != null && profile.age !== '' ? `${profile.age} \u6b72\uff08\u820a\u8cc7\u6599\u672a\u8a18\u9304\u751f\u65e5\uff09` : '');
            const fields = [
                ['\u59d3\u540d', profile.name], ['\u66b1\u7a31', profile.nickname], ['\u51fa\u751f\u5e74\u6708\u65e5', birthday],
                ['\u624b\u6a5f\u865f\u78bc', profile.phone], ['\u7dca\u6025\u9023\u7d61\u4eba\u96fb\u8a71', profile.emergencyPhone],
                ['\u50b7\u75c5\u53f2', profile.injuryHistory, true], ['\u5b78\u7fd2\u76ee\u6a19', profile.learningGoals, true]
            ];
            return (
                <div className="space-y-5">
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        {fields.map(([label, value, wide]) => <div key={label} className={`min-w-0 ${wide ? 'sm:col-span-2' : ''}`}>
                            <dt className="text-xs font-bold text-slate-500 mb-1">{label}</dt>
                            <dd className="text-sm text-slate-800 whitespace-pre-wrap break-words">{value || '\u672a\u586b\u5beb'}</dd>
                        </div>)}
                    </dl>
                    <div>
                        <h4 className="text-xs font-bold text-slate-500 mb-2">&#x504f;&#x597d;&#x4e0a;&#x8ab2;&#x98a8;&#x683c;</h4>
                        {profile.lessonStyle ? <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {LESSON_STYLE_OPTIONS.map(([key, label]) => <div key={key} className="bg-slate-50 border rounded-lg p-3 min-w-0">
                                <dt className="text-xs text-slate-600 leading-relaxed">{label}</dt>
                                <dd className="text-lg font-bold text-emerald-800 mt-2 tabular-nums">{profile.lessonStyle[key]}%</dd>
                            </div>)}
                        </dl> : <p className="text-sm text-slate-600">&#x672a;&#x586b;&#x5beb;</p>}
                    </div>
                    {!profile.isRepresentative && <div className="border-t pt-4">
                        <h4 className="text-xs font-bold text-slate-500 mb-1">&#x5e33;&#x865f;&#x4ee3;&#x8868;&#x806f;&#x7d61;&#x65b9;&#x5f0f;</h4>
                        <p className="text-sm text-slate-800 break-words">{profile.representativeName || '\u672a\u586b\u5beb'} &#xb7; {profile.representativePhone || '\u672a\u586b\u5beb'}</p>
                    </div>}
                </div>
            );
        };

        const BookingHistoryList = ({ bookings = [] }) => (
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1 min-w-0">
                {!bookings.length ? <p className="text-center text-gray-400 text-sm py-6">&#x7121;&#x9810;&#x7d04;&#x7d00;&#x9304;</p> : bookings.map((booking, index) => <article key={`${booking.isHistorical ? 'history' : 'booking'}-${booking.bookingId || index}`} className="border rounded-xl p-4 bg-white min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-bold text-slate-800 break-words">{booking.slotTitle || '\u672a\u77e5\u8ab2\u7a0b'}</h4><span className="text-xs bg-slate-100 text-slate-700 rounded px-2 py-1">{booking.status || '\u672a\u77e5\u72c0\u614b'}</span></div>
                    <p className="text-sm text-slate-600 mt-2">{formatTrainingDate(booking.slotDate || '')} {booking.slotTime || ''}</p>
                    {booking.location && <p className="text-sm text-slate-600 mt-1 break-words">{booking.location}</p>}
                    {booking.teachingCoachName && <p className="text-sm text-slate-600 mt-1 break-words">&#x6388;&#x8ab2;&#x6559;&#x7df4;&#xff1a;{booking.teachingCoachName}</p>}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm mt-2"><span className="font-bold text-emerald-700">{booking.paidPrice !== '' && booking.paidPrice != null && Number.isFinite(Number(booking.paidPrice)) ? formatMoney(Number(booking.paidPrice)) : '\u672a\u586b\u5beb'}</span><span className="text-slate-600">{booking.isHistorical ? (booking.paymentStatus === 'paid' ? '\u5df2\u6536\u6b3e' : '\u5c1a\u672a\u6536\u6b3e') : (booking.paymentCode || '-')}</span></div>
                    {booking.isHistorical && <p className="text-xs text-amber-800 mt-2">&#x624b;&#x52d5;&#x88dc;&#x767b; &#xb7; &#x539f;&#x9810;&#x7d04;&#x65e5;&#x671f;&#xff1a;{formatTrainingDate(booking.timestamp)}</p>}
                </article>)}
            </div>
        );

        const HistoricalBookingModal = ({ student, onClose, onSuccess }) => {
            const initialForm = { title: '', date: '', startTime: '19:00', endTime: '20:00', location: '', teachingCoachName: '', amount: '', paymentStatus: 'unpaid', bookingDate: '', status: '\u5df2\u5b8c\u8ab2' };
            const [form, setForm] = useState(initialForm);
            const [coaches, setCoaches] = useState([]);
            const [history, setHistory] = useState([]);
            const [ready, setReady] = useState(false);
            const [loading, setLoading] = useState(true);
            const [busy, setBusy] = useState(false);
            const [error, setError] = useState('');
            const [message, setMessage] = useState('');
            const [refresh, setRefresh] = useState(0);
            const busyRef = React.useRef(false);
            const requestRef = React.useRef(null);
            const readHistory = async () => {
                const result = await fetchAPI({ action: 'getStudentStats', lineId: student.lineId, studentId: student.studentId || '' });
                if (result.status !== 'success' || !Array.isArray(result.bookingHistory)) throw new Error(result.message || '\u7121\u6cd5\u8b80\u53d6\u6b77\u53f2\u9810\u7d04\u7d00\u9304\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002');
                return result.bookingHistory;
            };
            useEffect(() => {
                let active = true;
                setReady(false); setLoading(true); setError('');
                const load = async () => {
                    try {
                        const accessToken = typeof liff !== 'undefined' ? liff.getAccessToken() : null;
                        if (!accessToken) throw new Error('\u8acb\u91cd\u65b0\u767b\u5165 LINE\u3002');
                        const result = await fetchAPI({ action: 'getHistoricalBookingOptions', accessToken });
                        if (result.status !== 'success' || result.historicalBookingVersion !== 1) throw new Error('\u6b77\u53f2\u9810\u7d04\u88dc\u767b\u5c1a\u672a\u555f\u7528\uff0c\u8acb\u806f\u7d61\u7ba1\u7406\u54e1\u66f4\u65b0\u7cfb\u7d71\u3002');
                        const records = await readHistory();
                        if (active) { setCoaches(result.teachingCoaches || []); setHistory(records); setReady(true); }
                    } catch (err) { if (active) setError(err.message); }
                    finally { if (active) setLoading(false); }
                };
                load();
                return () => { active = false; };
            }, [student, refresh]);
            const update = (key, value) => { requestRef.current = null; setMessage(''); setForm(prev => ({ ...prev, [key]: value })); };
            const save = async event => {
                event.preventDefault();
                if (!ready || busyRef.current) return;
                busyRef.current = true; setBusy(true); setError(''); setMessage('');
                let saved = false;
                try {
                    const accessToken = typeof liff !== 'undefined' ? liff.getAccessToken() : null;
                    if (!accessToken) throw new Error('\u8acb\u91cd\u65b0\u767b\u5165 LINE\u3002');
                    if (!requestRef.current) requestRef.current = window.crypto?.randomUUID ? window.crypto.randomUUID() : 'history-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
                    const result = await fetchAPI({ action: 'coachAddHistoricalBooking', lineId: student.lineId, studentId: student.studentId || '', ...form, requestId: requestRef.current, accessToken });
                    if (result.status !== 'success' || !result.bookingId) throw new Error(result.message || '\u6b77\u53f2\u9810\u7d04\u88dc\u767b\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002');
                    saved = true;
                    setHistory(await readHistory());
                    await onSuccess();
                    requestRef.current = null; setForm(initialForm); setMessage('\u6b77\u53f2\u9810\u7d04\u5df2\u65b0\u589e\uff0c\u4ed8\u6b3e\u7d71\u8a08\u5df2\u66f4\u65b0\u3002');
                } catch (err) { setError(saved ? '\u6b77\u53f2\u9810\u7d04\u5df2\u5132\u5b58\uff0c\u4f46\u91cd\u65b0\u8b80\u53d6\u5931\u6557\u3002\u8acb\u5148\u91cd\u65b0\u6574\u7406\u78ba\u8a8d\uff0c\u52ff\u91cd\u8907\u88dc\u767b\u3002' : err.message); }
                finally { busyRef.current = false; setBusy(false); }
            };
            return <div className="fixed inset-0 z-50 bg-slate-900 bg-opacity-60 p-3 md:p-5 flex items-center justify-center">
                <div role="dialog" aria-modal="true" aria-labelledby="historical-booking-title" className="bg-gray-50 rounded-2xl shadow-xl w-full max-w-4xl max-h-[90dvh] overflow-y-auto min-w-0">
                    <div className="sticky top-0 z-10 bg-slate-800 text-white p-4 flex flex-wrap items-center justify-between gap-3"><h2 id="historical-booking-title" className="font-bold">&#x88dc;&#x767b;&#x6b77;&#x53f2;&#x9810;&#x7d04;&#xff1a;{student.name}</h2><button type="button" disabled={busy} onClick={onClose} className="border border-slate-500 rounded-lg px-3 py-2">&#x95dc;&#x9589;</button></div>
                    <div className="p-4 md:p-6 space-y-5">
                        <p className="text-sm text-slate-600 leading-relaxed">&#x50c5;&#x88dc;&#x767b;&#x6b64;&#x5b78;&#x54e1;&#x5df2;&#x7d50;&#x675f;&#x7684;&#x8ab2;&#x7a0b;&#xff0c;&#x4e0d;&#x4f54;&#x7528;&#x76ee;&#x524d;&#x540d;&#x984d;&#x3002;&#x5df2;&#x6536;&#x6b3e;&#x4e14;&#x672a;&#x53d6;&#x6d88;&#x7684;&#x7d00;&#x9304;&#x6703;&#x8a08;&#x5165;&#x7d2f;&#x7a4d;&#x4ed8;&#x6b3e;&#xff0c;&#x6708;&#x4efd;&#x4f9d;&#x4e0a;&#x8ab2;&#x65e5;&#x671f;&#x7d71;&#x8a08;&#xff1b;&#x4e0d;&#x6703;&#x81ea;&#x52d5;&#x7522;&#x751f;&#x65e5;&#x8a8c;&#x6216;&#x589e;&#x52a0;&#x8a13;&#x7df4;&#x6642;&#x6578;&#xff0c;&#x5b8c;&#x6210;&#x5802;&#x6578;&#x4ecd;&#x4f9d;&#x8a13;&#x7df4;&#x65e5;&#x8a8c;&#x8a08;&#x7b97;&#x3002;</p>
                        {loading && <p role="status" className="text-sm text-slate-500">&#x8b80;&#x53d6;&#x6b77;&#x53f2;&#x9810;&#x7d04;&#x4e2d;...</p>}
                        {error && <div role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg p-3"><p>{error}</p>{!ready && !loading && <button type="button" onClick={() => setRefresh(n => n + 1)} className="border rounded-lg px-3 py-2 mt-2">&#x91cd;&#x65b0;&#x8b80;&#x53d6;&#x6b77;&#x53f2;&#x9810;&#x7d04;</button>}</div>}
                        {message && <p role="status" className="text-sm text-emerald-800 bg-emerald-50 rounded-lg p-3">{message}</p>}
                        <form onSubmit={save} aria-label="&#x6b77;&#x53f2;&#x9810;&#x7d04;&#x8cc7;&#x6599;" className="bg-white border rounded-xl p-4 space-y-4">
                            <fieldset disabled={!ready || busy} className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
                                <label className="block text-sm font-bold">&#x6b77;&#x53f2;&#x8ab2;&#x7a0b;&#x540d;&#x7a31;<input aria-label="&#x6b77;&#x53f2;&#x8ab2;&#x7a0b;&#x540d;&#x7a31;" required maxLength={100} value={form.title} onChange={e => update('title', e.target.value)} className="block w-full min-w-0 border rounded-lg p-3 mt-1 font-normal" /></label>
                                <label className="block text-sm font-bold">&#x6b77;&#x53f2;&#x4e0a;&#x8ab2;&#x65e5;&#x671f;<input aria-label="&#x6b77;&#x53f2;&#x4e0a;&#x8ab2;&#x65e5;&#x671f;" type="date" required min="1900-01-01" max={registrationToday()} value={form.date} onChange={e => update('date', e.target.value)} className="block w-full min-w-0 border rounded-lg p-3 mt-1 font-normal" /></label>
                                <label className="block text-sm font-bold">&#x6b77;&#x53f2;&#x958b;&#x59cb;&#x6642;&#x9593;<input aria-label="&#x6b77;&#x53f2;&#x958b;&#x59cb;&#x6642;&#x9593;" type="time" required value={form.startTime} onChange={e => update('startTime', e.target.value)} className="block w-full min-w-0 border rounded-lg p-3 mt-1 font-normal" /></label>
                                <label className="block text-sm font-bold">&#x6b77;&#x53f2;&#x7d50;&#x675f;&#x6642;&#x9593;<input aria-label="&#x6b77;&#x53f2;&#x7d50;&#x675f;&#x6642;&#x9593;" type="time" required value={form.endTime} onChange={e => update('endTime', e.target.value)} className="block w-full min-w-0 border rounded-lg p-3 mt-1 font-normal" /></label>
                                <label className="block text-sm font-bold">&#x6b77;&#x53f2;&#x4e0a;&#x8ab2;&#x5730;&#x9ede;<input aria-label="&#x6b77;&#x53f2;&#x4e0a;&#x8ab2;&#x5730;&#x9ede;" required maxLength={120} value={form.location} onChange={e => update('location', e.target.value)} className="block w-full min-w-0 border rounded-lg p-3 mt-1 font-normal" /></label>
                                <label className="block text-sm font-bold">&#x6b77;&#x53f2;&#x6388;&#x8ab2;&#x6559;&#x7df4;&#xff08;&#x9078;&#x586b;&#xff09;<input aria-label="&#x6b77;&#x53f2;&#x6388;&#x8ab2;&#x6559;&#x7df4;&#xff08;&#x9078;&#x586b;&#xff09;" list="historical-coach-names" maxLength={60} value={form.teachingCoachName} onChange={e => update('teachingCoachName', e.target.value)} className="block w-full min-w-0 border rounded-lg p-3 mt-1 font-normal" /><datalist id="historical-coach-names">{coaches.map(coach => <option key={coach.id} value={coach.name} />)}</datalist></label>
                                <label className="block text-sm font-bold">&#x6b77;&#x53f2;&#x8ab2;&#x7a0b;&#x91d1;&#x984d;<input aria-label="&#x6b77;&#x53f2;&#x8ab2;&#x7a0b;&#x91d1;&#x984d;" type="number" min="0" max="10000000" step="0.01" required value={form.amount} onChange={e => update('amount', e.target.value)} className="block w-full min-w-0 border rounded-lg p-3 mt-1 font-normal" /></label>
                                <label className="block text-sm font-bold">&#x6b77;&#x53f2;&#x4ed8;&#x6b3e;&#x72c0;&#x614b;<select aria-label="&#x6b77;&#x53f2;&#x4ed8;&#x6b3e;&#x72c0;&#x614b;" value={form.paymentStatus} onChange={e => update('paymentStatus', e.target.value)} className="block w-full min-w-0 border rounded-lg p-3 mt-1 bg-white font-normal"><option value="unpaid">&#x5c1a;&#x672a;&#x6536;&#x6b3e;</option><option value="paid">&#x5df2;&#x6536;&#x6b3e;</option></select></label>
                                <label className="block text-sm font-bold">&#x6b77;&#x53f2;&#x8ab2;&#x7a0b;&#x72c0;&#x614b;<select aria-label="&#x6b77;&#x53f2;&#x8ab2;&#x7a0b;&#x72c0;&#x614b;" value={form.status} onChange={e => update('status', e.target.value)} className="block w-full min-w-0 border rounded-lg p-3 mt-1 bg-white font-normal">{['\u5df2\u5b8c\u8ab2', '\u9810\u7d04\u6210\u529f', '\u5df2\u53d6\u6d88'].map(status => <option key={status} value={status}>{status}</option>)}</select></label>
                                <label className="block text-sm font-bold">&#x539f;&#x9810;&#x7d04;&#x65e5;&#x671f;&#xff08;&#x9078;&#x586b;&#xff09;<input aria-label="&#x539f;&#x9810;&#x7d04;&#x65e5;&#x671f;&#xff08;&#x9078;&#x586b;&#xff09;" type="date" min="1900-01-01" max={form.date || registrationToday()} value={form.bookingDate} onChange={e => update('bookingDate', e.target.value)} className="block w-full min-w-0 border rounded-lg p-3 mt-1 font-normal" /><span className="block font-normal text-xs text-slate-500 mt-1">&#x672a;&#x586b;&#x5beb;&#x6642;&#xff0c;&#x4f9d;&#x4e0a;&#x8ab2;&#x65e5;&#x671f;&#x8a18;&#x9304;&#x539f;&#x9810;&#x7d04;&#x65e5;&#x671f;&#x3002;</span></label>
                            </fieldset>
                            <button type="submit" disabled={!ready || busy} className="bg-emerald-700 text-white font-bold rounded-lg px-5 py-3 disabled:opacity-50">{busy ? '\u5132\u5b58\u4e2d...' : '\u65b0\u589e\u6b77\u53f2\u9810\u7d04'}</button>
                        </form>
                        <section aria-label="&#x6b64;&#x5b78;&#x54e1;&#x7684;&#x6b77;&#x53f2;&#x9810;&#x7d04;"><h3 className="font-bold text-slate-800 mb-3">&#x6b77;&#x53f2;&#x9810;&#x7d04;&#x7d00;&#x9304;</h3><BookingHistoryList bookings={history} /></section>
                    </div>
                </div>
            </div>;
        };

        const StudentDetailsModal = ({ student, onClose }) => {
            const [data, setData] = useState(null);
            const [statsError, setStatsError] = useState('');
            const [profile, setProfile] = useState(null);
            const [profileError, setProfileError] = useState('');
            const [profileLoading, setProfileLoading] = useState(true);
            const [refresh, setRefresh] = useState(0);

            useEffect(() => {
                let active = true;
                setData(null); setStatsError(''); setProfile(null); setProfileError(''); setProfileLoading(true);
                if (!student || !student.lineId) {
                    setStatsError('\u627e\u4e0d\u5230\u5b78\u54e1\u5e33\u865f\u3002'); setProfileError('\u627e\u4e0d\u5230\u5b78\u54e1\u5e33\u865f\u3002'); setProfileLoading(false);
                    return () => { active = false; };
                }
                fetchAPI({ action: 'getStudentStats', lineId: student.lineId, studentId: student.studentId || '' }).then(result => {
                    if (!result || result.status !== 'success') throw new Error(result?.message || '\u7121\u6cd5\u8b80\u53d6\u8a13\u7df4\u7d00\u9304\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002');
                    if (active) setData(result);
                }).catch(error => { if (active) setStatsError(error.message); });
                const loadProfile = async () => {
                    try {
                        const accessToken = typeof liff !== 'undefined' ? liff.getAccessToken() : null;
                        if (!accessToken) throw new Error('\u8acb\u91cd\u65b0\u767b\u5165 LINE \u5f8c\u6aa2\u8996\u5b78\u54e1\u57fa\u672c\u8cc7\u6599\u3002');
                        const result = await fetchAPI({ action: 'getStudentProfile', lineId: student.lineId, studentId: student.studentId || '', accessToken });
                        if (!result || result.status !== 'success') {
                            const message = String(result?.message || '\u7121\u6cd5\u8b80\u53d6\u5b78\u54e1\u57fa\u672c\u8cc7\u6599\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002');
                            throw new Error(message.startsWith('\u4e0d\u652f\u63f4\u7684\u64cd\u4f5c') ? '\u5c1a\u672a\u555f\u7528\u57fa\u672c\u8cc7\u6599\u6aa2\u8996\uff0c\u8acb\u806f\u7d61\u7ba1\u7406\u54e1\u66f4\u65b0\u7cfb\u7d71\u3002' : message);
                        }
                        if (!result.profile || result.profile.lineId !== student.lineId || result.profile.studentId !== (student.studentId || '')) throw new Error('\u57fa\u672c\u8cc7\u6599\u56de\u61c9\u4e0d\u5b8c\u6574\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002');
                        if (active) setProfile(result.profile);
                    } catch (error) { if (active) setProfileError(error.message); }
                    finally { if (active) setProfileLoading(false); }
                };
                loadProfile();
                return () => { active = false; };
            }, [student, refresh]);

            return (
                <div className="fixed inset-0 bg-slate-900 bg-opacity-60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden my-auto max-h-[90dvh] flex flex-col">
                        <div className="bg-slate-800 p-4 md:p-5 text-white flex gap-3 justify-between items-center shrink-0">
                            <h3 className="font-bold text-base md:text-lg flex items-center gap-2">
                                <span className="text-emerald-400">&#x5b78;&#x54e1;&#x6a94;&#x6848;&#xff1a;</span> {student ? student.name : ''}
                            </h3>
                            <button onClick={onClose} className="text-slate-400 hover:text-white font-bold text-3xl px-2 shrink-0 leading-none active:scale-90">&times;</button>
                        </div>
                        
                        <div className="p-4 md:p-6 overflow-y-auto bg-gray-50 flex-1 min-w-0">
                            <section aria-labelledby="student-registration-title" className="bg-white rounded-2xl shadow-sm border p-5 md:p-6 mb-6">
                                <div className="flex flex-wrap items-center gap-3 mb-4">
                                    <h3 id="student-registration-title" className="font-bold text-base md:text-lg text-slate-800">&#x8a3b;&#x518a;&#x57fa;&#x672c;&#x8cc7;&#x6599;</h3>
                                    {profile?.isRepresentative && <span className="bg-amber-100 text-amber-900 text-xs px-2 py-1 rounded">&#x5e33;&#x865f;&#x4ee3;&#x8868;</span>}
                                </div>
                                {profileLoading ? <p role="status" className="text-sm text-slate-500">&#x8b80;&#x53d6;&#x57fa;&#x672c;&#x8cc7;&#x6599;&#x4e2d;...</p> : profileError ? <div role="alert" className="text-sm text-red-700"><p>{profileError}</p><button type="button" onClick={() => setRefresh(value => value + 1)} className="mt-3 border border-red-200 rounded-lg px-3 py-2">&#x91cd;&#x65b0;&#x8b80;&#x53d6;&#x57fa;&#x672c;&#x8cc7;&#x6599;</button></div> : profile && <StudentRegistrationDetails profile={profile} />}
                            </section>
                            {!data ? (
                                statsError ? <div role="alert" className="text-sm text-red-700"><p>{statsError}</p><button type="button" onClick={() => setRefresh(value => value + 1)} className="mt-3 border rounded-lg px-3 py-2">&#x91cd;&#x65b0;&#x8b80;&#x53d6;&#x8a13;&#x7df4;&#x7d00;&#x9304;</button></div> : <div className="text-center py-20 text-gray-500 font-bold animate-pulse">&#x8b80;&#x53d6;&#x5b78;&#x54e1;&#x8cc7;&#x6599;&#x4e2d;...</div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="bg-white rounded-2xl shadow-sm border p-5 md:p-6 h-fit">
                                            <h3 className="font-bold text-slate-800 mb-4 ml-1 flex items-center text-base md:text-lg">
                                                <span className="w-1.5 h-5 bg-emerald-500 rounded mr-2"></span>&#x80fd;&#x529b;&#x6642;&#x6578;&#x96f7;&#x9054;
                                            </h3>
                                            <p className="text-xs text-slate-500 mb-3">&#x8a13;&#x7df4;&#x6b21;&#x6578;&#x4f9d;&#x6bcf; 5 &#x5206;&#x9418;&#x7d04; 40 &#x6b21;&#x4f30;&#x7b97;&#x3002;</p>
                                            <div data-layout="skill-radar" className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                {SKILL_KEYS.map(skill => (
                                                    <CircleProgress key={skill.key} label={skill.label} value={data.stats ? data.stats[skill.key] : 0} />
                                                ))}
                                            </div>
                                        </div>
                                        <div className="bg-white rounded-2xl shadow-sm border p-5 md:p-6">
                                            <h3 className="font-bold text-slate-800 mb-4 ml-1 flex items-center text-base md:text-lg">
                                                <span className="w-1.5 h-5 bg-blue-500 rounded mr-2"></span>&#x6b77;&#x53f2;&#x8a13;&#x7df4;&#x65e5;&#x8a8c;
                                            </h3>
                                            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2">
                                                {!data.logs || data.logs.length === 0 ? (
                                                    <div className="text-center text-gray-400 text-sm py-6">&#x5c1a;&#x7121;&#x65e5;&#x8a8c;&#x7d00;&#x9304;</div>
                                                ) : (
                                                    data.logs.map((log, i) => (
                                                        <div key={i} className="border-b border-dashed border-gray-200 pb-4 last:border-0 last:pb-0">
                                                            <div className="text-sm font-bold text-emerald-600 mb-1.5">{formatTrainingDate(log.date)}</div>
                                                            <p className="text-sm md:text-base text-gray-700 whitespace-pre-wrap leading-relaxed">{log.note || '\u672c\u6b21\u7121\u7279\u5225\u5099\u8a3b'}</p>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-white rounded-2xl shadow-sm border p-5 md:p-6">
                                        <h3 className="font-bold text-slate-800 mb-4 ml-1 flex items-center text-base md:text-lg">
                                            <span className="w-1.5 h-5 bg-amber-500 rounded mr-2"></span>&#x6b77;&#x53f2;&#x9810;&#x7d04;&#x7d00;&#x9304;
                                        </h3>
                                        <BookingHistoryList bookings={data.bookingHistory || data.bookings || []} />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )
        };

        // ==========================================
        // \ud83d\udd39 \u5b78\u751f\u7aef\u4e3b\u9801\u9762\u8207\u5b50\u8996\u5716
        // ==========================================

        const LanguageSwitch = () => {
            const [language, setLanguage] = useState(() => window.BadmintonI18n?.getLanguage() || 'zh-TW');
            useEffect(() => {
                const syncLanguage = event => setLanguage(event.detail);
                window.addEventListener('badminton-language-change', syncLanguage);
                return () => window.removeEventListener('badminton-language-change', syncLanguage);
            }, []);
            return (
                <nav className="language-switch" translate="no" aria-label="Language / &#x8a9e;&#x8a00;">
                    {[['zh-TW', '\u4e2d\u6587'], ['ja', '\u65e5\u672c\u8a9e']].map(([value, label]) => (
                        <button key={value} type="button" data-language={value} aria-pressed={language === value} onClick={() => window.BadmintonI18n?.setLanguage(value)}>{label}</button>
                    ))}
                </nav>
            );
        };

        const BRAND_BANNER_ASSET = './assets/r-6fac621453c2ef47d6dd.bin';
        const BRAND_BANNER_MASK = [211, 47, 130, 93, 18, 237, 61, 176, 74, 199, 8, 151, 229, 53, 116, 32, 165, 14, 243, 87, 194, 105, 42, 218, 7, 158, 65, 240, 123, 29, 184, 96];
        let brandBannerPromise;
        const loadBrandBanner = () => {
            if (!brandBannerPromise) {
                brandBannerPromise = fetch(BRAND_BANNER_ASSET).then(response => {
                    if (!response.ok) throw new Error('Banner resource unavailable.');
                    return response.arrayBuffer();
                }).then(buffer => {
                    const bytes = new Uint8Array(buffer);
                    for (let i = 0; i < bytes.length; i++) bytes[i] ^= BRAND_BANNER_MASK[i % BRAND_BANNER_MASK.length];
                    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
                    if (!signature.every((value, index) => bytes[index] === value)) throw new Error('Invalid banner resource.');
                    return URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
                }).catch(error => { brandBannerPromise = null; throw error; });
            }
            return brandBannerPromise;
        };
        const BrandBanner = () => {
            const [source, setSource] = useState('');
            useEffect(() => {
                let active = true;
                loadBrandBanner().then(url => { if (active) setSource(url); }).catch(() => {});
                return () => { active = false; };
            }, []);
            return (
                <div role="img" aria-label="&#x6a02;&#x52d5;&#x7fbd;&#x7403;&#xff0c;&#x6a02;&#x5728;&#x904b;&#x52d5;&#xff0c;&#x52d5;&#x51fa;&#x5065;&#x5eb7;" className="brand-banner w-full shrink-0" style={{ aspectRatio: '8 / 3', backgroundImage: source ? `url("${source}")` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }} />
            );
        };

        const studentNickname = (student, index = 0) => {
            const nickname = typeof student?.nickname === 'string' ? student.nickname.trim() : '';
            return nickname || `\u5b78\u54e1 ${index + 1}`;
        };

        const validateAccountRecord = (user, expectedCount = null) => {
          if (!user || !Array.isArray(user.students) || user.students.length < 1 || user.students.length > 3) throw new Error('\u5f8c\u7aef\u5c1a\u672a\u56de\u50b3\u5b8c\u6574\u5b78\u751f\u8cc7\u6599\uff0c\u8acb\u5148\u66f4\u65b0\u539f\u6709 Apps Script \u90e8\u7f72\u70ba\u6700\u65b0\u5b8c\u6574 Code.gs\uff0c\u518d\u91cd\u65b0\u767b\u5165\u3002');
          if (user.studentCount != null && Number(user.studentCount) !== user.students.length) throw new Error('\u5e33\u865f\u5b78\u751f\u4eba\u6578\u8cc7\u6599\u4e0d\u4e00\u81f4\uff0c\u8acb\u806f\u7d61\u6559\u7df4\u78ba\u8a8d\u3002');
          if (expectedCount != null && (user.students.length !== expectedCount || user.registrationComplete === false)) throw new Error('\u5b78\u751f\u8cc7\u6599\u5c1a\u672a\u5b8c\u6574\u5132\u5b58\uff0c\u8acb\u4fdd\u7559\u8868\u55ae\u4e26\u78ba\u8a8d Apps Script \u5df2\u66f4\u65b0\uff0c\u518d\u91cd\u8a66\u3002');
          return user;
        };

        const REGISTRATION_NOTES = {
            name: '\u8acb\u586b\u5beb\u771f\u5be6\u4e2d\u6587\u59d3\u540d\uff0c\u4ee5\u4fbf\u65bc\u6838\u5c0d\u9810\u7d04\u540d\u55ae\u8207\u5f8c\u7e8c\u884c\u653f\u4f5c\u696d\u3002',
            nickname: '\u8acb\u586b\u5beb\u60a8\u5e0c\u671b\u5728\u8ab2\u5802\u4e0a\u6559\u7df4\u7a31\u547c\u60a8\u7684\u540d\u5b57\uff0c\u8b93\u6211\u5011\u66f4\u89aa\u5207\u5730\u4e92\u52d5\uff01',
            birthDate: '\u5354\u52a9\u6559\u7df4\u4e86\u89e3\u60a8\u7684\u5e74\u9f61\u5c64\uff0c\u4ee5\u5b89\u6392\u6700\u9069\u5408\u60a8\u7684\u9ad4\u80fd\u8a13\u7df4\u5f37\u5ea6\u3002',
            phone: '\u7528\u65bc\u8ab2\u7a0b\u9810\u7d04\u6210\u529f\u901a\u77e5\u8207\u91cd\u8981\u7570\u52d5\u63d0\u9192\u3002',
            injuryHistory: '\u82e5\u60a8\u6709\u4efb\u4f55\u95dc\u7bc0\uff08\u5982\u80a9\u8180\u3001\u624b\u8155\u3001\u8170\u90e8\u3001\u819d\u84cb\uff09\u820a\u50b7\u6216\u8fd1\u671f\u4e0d\u9069\uff0c\u8acb\u52d9\u5fc5\u7c21\u8ff0\u3002\u6559\u7df4\u6703\u4f9d\u6b64\u8abf\u6574\u60a8\u7684\u5c08\u5c6c\u8a13\u7df4\u52d5\u4f5c\u8207\u767c\u529b\u65b9\u5f0f\uff0c\u9810\u9632\u4ee3\u511f\u53d7\u50b7\u3002\u7121\u5247\u514d\u586b\u3002',
            emergencyPhone: '\u904b\u52d5\u5b89\u5168\u81f3\u4e0a\uff0c\u6b64\u8cc7\u8a0a\u50c5\u4f9b\u8ab2\u5802\u7a81\u767c\u7dca\u6025\u72c0\u6cc1\u6642\u806f\u7e6b\u4f7f\u7528\uff0c\u8acb\u653e\u5fc3\u586b\u5beb\u3002',
            learningGoals: '\u8acb\u7c21\u8ff0\u60a8\u6700\u60f3\u6539\u5584\u7684\u6280\u8853\u6216\u4e0a\u8ab2\u76ee\u7684\uff08\u4f8b\u5982\uff1a\u300c\u60f3\u5b78\u6b63\u78ba\u767c\u529b\u65b9\u5f0f\u300d\u3001\u300c\u60f3\u628a\u52d5\u4f5c\u77ef\u6b63\u6f02\u4eae\u300d\u3001\u300c\u907f\u514d\u53d7\u50b7\u300d\u3001\u300c\u52a0\u5f37\u7a69\u5b9a\u5ea6\u300d\u6216\u300c\u7d14\u7cb9\u60f3\u904b\u52d5\u6d41\u6c57\u300d\uff09\uff0c\u9019\u5c07\u5e6b\u52a9\u6559\u7df4\u5feb\u901f\u70ba\u60a8\u91cf\u8eab\u8a2d\u5b9a\u8a13\u7df4\u83dc\u55ae\u8207\u9032\u5ea6\u3002',
            lessonStyle: '\u6bcf\u4f4d\u5b78\u54e1\u5438\u6536\u6280\u5de7\u7684\u65b9\u5f0f\u8207\u671f\u671b\u7684\u7bc0\u594f\u4e0d\u540c\uff0c\u8acb\u9078\u64c7\u60a8\u6700\u5e0c\u671b\u5728\u8ab2\u5802\u4e2d ABC \u7684\u4f54\u6bd4\u3002'
        };
        const LESSON_STYLE_OPTIONS = [
            ['theory', 'A. \u52d5\u4f5c\u539f\u7406\u89e3\u8aaa\u6559\u5b78\u6642\u9593', '\u9069\u5408\u559c\u6b61\u5148\u6e05\u695a\u7406\u89e3\u767c\u529b\u539f\u7406\u8207\u8173\u6b65\u908f\u8f2f\u7684\u5b78\u54e1'],
            ['multiball', 'B. \u591a\u7403\u8a13\u7df4\u6642\u9593', '\u9069\u5408\u559c\u6b61\u900f\u904e\u5927\u91cf\u64ca\u7403\u5efa\u7acb\u808c\u8089\u8a18\u61b6\uff0c\u8ffd\u6c42\u904b\u52d5\u91cf\u8207\u6d41\u6c57\u5feb\u611f\u7684\u5b78\u54e1'],
            ['correction', 'C. \u52d5\u4f5c\u77ef\u6b63\u8aaa\u660e\u6642\u9593', '\u9069\u5408\u5df2\u6709\u57fa\u790e\uff0c\u5e0c\u671b\u6559\u7df4\u91dd\u5c0d\u73fe\u6709\u52d5\u4f5c\u6293\u6f0f\u3001\u5fae\u8abf\u767c\u529b\u7fd2\u6163\u4e26\u7a81\u7834\u74f6\u9838\u7684\u5b78\u54e1']
        ];
        const rebalanceLessonStyle = (style, key, value) => {
            const others = ['theory', 'multiball', 'correction'].filter(item => item !== key);
            const chosen = Math.max(0, Math.min(100, Math.round(Number(value))));
            const remaining = 100 - chosen;
            const previous = style[others[0]] + style[others[1]];
            const first = previous ? Math.round(remaining * style[others[0]] / previous) : Math.round(remaining / 2);
            return { ...style, [key]: chosen, [others[0]]: first, [others[1]]: remaining - first };
        };
        const registrationToday = () => new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const registrationBirthday = (student, today = registrationToday()) => {
            const birthDate = `${student.birthYear}-${String(student.birthMonth).padStart(2, '0')}-${String(student.birthDay).padStart(2, '0')}`;
            const date = new Date(birthDate + 'T00:00:00Z');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== birthDate || birthDate > today || Number(student.birthYear) < Number(today.slice(0, 4)) - 120) throw new Error('\u8acb\u9078\u64c7\u6709\u6548\u7684\u51fa\u751f\u5e74\u6708\u65e5\u3002');
            return birthDate;
        };

        const RegisterView = ({ profile, onRegistered, existingUser = null, onCancel }) => {
          const emptyStudent = () => ({ name: '', nickname: '', birthYear: '', birthMonth: '', birthDay: '', phone: '', injuryHistory: '', emergencyPhone: '', learningGoals: '', lessonStyle: { theory: 34, multiball: 33, correction: 33 } });
          const [students, setStudents] = useState([{ ...emptyStudent(), name: existingUser?.name || '', phone: existingUser?.phone || '' }]);
          const [submitting, setSubmitting] = useState(false);
          const today = registrationToday();
          const currentYear = Number(today.slice(0, 4));
          const updateStudent = (index, key, value) => setStudents(previous => previous.map((student, i) => i === index ? { ...student, [key]: value } : student));
          const updateBirthday = (index, key, value) => setStudents(previous => previous.map((student, i) => {
            if (i !== index) return student;
            const next = { ...student, [key]: value };
            const days = next.birthYear && next.birthMonth ? new Date(Number(next.birthYear), Number(next.birthMonth), 0).getDate() : 31;
            if (Number(next.birthDay) > days) next.birthDay = '';
            return next;
          }));
          const handleSubmit = async (e) => {
            e.preventDefault();
            if (submitting) return;
            setSubmitting(true);
            try {
              const registrationStudents = students.map((student, index) => {
                const birthDate = registrationBirthday(student);
                const phone = student.phone.replace(/[\s-]/g, '');
                const emergencyPhone = student.emergencyPhone.replace(/[\s()-]/g, '');
                if ((index === 0 || phone) && !/^09\d{8}$/.test(phone)) throw new Error('\u8acb\u586b\u5beb\u6709\u6548\u624b\u6a5f\u865f\u78bc\u3002');
                if ((index === 0 || emergencyPhone) && !/^0\d{8,9}$/.test(emergencyPhone)) throw new Error('\u8acb\u586b\u5beb\u6709\u6548\u7dca\u6025\u9023\u7d61\u4eba\u96fb\u8a71\u3002');
                return { name: student.name.trim(), nickname: student.nickname.trim(), birthDate, phone, injuryHistory: student.injuryHistory.trim(), emergencyPhone, learningGoals: student.learningGoals.trim(), lessonStyle: student.lessonStyle };
              });
              const lineId = profile ? profile.userId : '';
              const support = await fetchAPI({ action: 'checkUser', lineId });
              if (support.status !== 'success' || support.registrationProfileVersion !== 2) throw new Error('\u76ee\u524d\u5f8c\u7aef\u5c1a\u672a\u652f\u63f4\u65b0\u7248\u8a3b\u518a\u8cc7\u6599\uff0c\u672c\u6b21\u5c1a\u672a\u9001\u51fa\u8cc7\u6599\u3002');
              const action = existingUser ? 'completeAccountRegistration' : 'registerUser';
              const accessToken = existingUser && typeof liff !== 'undefined' ? liff.getAccessToken() : undefined;
              const result = await fetchAPI({ action, lineId, students: registrationStudents, registrationProfileVersion: 2, accessToken });
              if (result.status !== 'success') throw new Error(result.message || '\u8a3b\u518a\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66');
              validateAccountRecord(result.user, students.length);
              if (result.user.registrationProfileVersion !== 2) throw new Error('\u65b0\u7248\u8a3b\u518a\u8cc7\u6599\u5c1a\u672a\u5b8c\u6574\u5132\u5b58\uff0c\u8acb\u806f\u7d61\u6559\u7df4\u78ba\u8a8d\u3002');
              const registered = await fetchAPI({ action: 'checkUser', lineId });
              if (registered.status !== 'success') throw new Error('\u8cc7\u6599\u5df2\u9001\u51fa\uff0c\u8b80\u53d6\u5931\u6557\uff0c\u8acb\u91cd\u65b0\u767b\u5165\u78ba\u8a8d\u3002');
              const savedUser = validateAccountRecord(registered.user, students.length);
              if (savedUser.registrationProfileVersion !== 2) throw new Error('\u65b0\u7248\u8a3b\u518a\u8cc7\u6599\u5c1a\u672a\u5b8c\u6574\u5132\u5b58\uff0c\u8acb\u806f\u7d61\u6559\u7df4\u78ba\u8a8d\u3002');
              if (onRegistered) onRegistered(savedUser);
            } catch (error) { alert(error.message); }
            finally { setSubmitting(false); }
          };
          const inputClass = 'block w-full border p-3 rounded-lg mt-1 font-normal';
          const noteClass = 'block text-xs leading-relaxed text-slate-500 font-normal mt-1';
          return (
            <div className="registration-shell max-w-md md:max-w-lg mx-auto md:my-16 p-5 md:p-8 bg-white md:rounded-2xl shadow-xl border-t-4 border-slate-800 min-h-screen md:min-h-0">
              <div className="registration-heading mb-6 border-b pb-5">
                <BrandBanner />
                <div className="language-switch-row mt-4">
                  <h2 className="text-xl font-bold text-slate-800">&#x5b78;&#x54e1;&#x8cc7;&#x6599;&#x767b;&#x8a18;</h2>
                  <LanguageSwitch />
                </div>
                <p className="text-sm text-slate-500 mt-1">{existingUser ? '\u88dc\u767b\u540c\u5e33\u865f\u5b78\u751f\u8cc7\u6599\uff08\u4fdd\u7559\u65e2\u6709\u9810\u7d04\u8207\u7d00\u9304\uff09' : '\u9996\u6b21\u767b\u5165\u8acb\u7d81\u5b9a\u5b78\u54e1\u8cc7\u6599'}</p>
              </div>
              <form onSubmit={handleSubmit} className="registration-form space-y-5">
                <label className="block font-bold">&#x5b78;&#x751f;&#x4eba;&#x6578;
                  <select aria-label="&#x5b78;&#x751f;&#x4eba;&#x6578;" disabled={submitting} className={inputClass} value={students.length} onChange={e => setStudents(previous => Array.from({ length: Number(e.target.value) }, (_, i) => previous[i] || emptyStudent()))}>
                    {[1,2,3].map(count => <option key={count} value={count}>{count} &#x4eba;</option>)}
                  </select>
                </label>
                <p className="text-sm text-slate-600">&#x9810;&#x7d04;&#x6642;&#x5c07;&#x81ea;&#x52d5;&#x9810;&#x8a02;&#x5168;&#x90e8;&#x5b78;&#x751f;&#x7684;&#x540d;&#x984d;&#x4e26;&#x52a0;&#x7e3d;&#x8cbb;&#x7528;&#x3002;&#x7b2c;&#x4e00;&#x4f4d;&#x5b78;&#x751f;&#x70ba;&#x4ee3;&#x8868;&#xff1b;&#x5176;&#x4ed6;&#x5b78;&#x54e1;&#x53ef;&#x7701;&#x7565;&#x624b;&#x6a5f;&#x865f;&#x78bc;&#x53ca;&#x7dca;&#x6025;&#x9023;&#x7d61;&#x4eba;&#x96fb;&#x8a71;&#x3002;&#x50b7;&#x75c5;&#x53f2;&#x7121;&#x5247;&#x514d;&#x586b;&#x3002;</p>
                {students.map((student, index) => <fieldset key={index} disabled={submitting} className="registration-student border rounded-xl p-4 space-y-5">
                  <legend className="font-bold">&#x5b78;&#x751f; {index + 1}{index === 0 ? '\uff08\u4ee3\u8868\uff09' : ''}</legend>
                  {['name','nickname'].map(key => <label key={key} className="block text-sm font-bold">{key === 'name' ? '\u59d3\u540d' : '\u66b1\u7a31'}
                    <input required maxLength="60" autoComplete={key === 'name' ? 'name' : 'nickname'} pattern={key === 'name' ? '[\\p{Script=Han}\u00b7\u30fb\u2027 ]+' : undefined} aria-describedby={`registration-${index}-${key}-note`} className={inputClass} value={student[key]} onChange={e => updateStudent(index, key, e.target.value)} />
                    <span id={`registration-${index}-${key}-note`} className={noteClass}>{REGISTRATION_NOTES[key]}</span>
                  </label>)}
                  <div role="group" aria-labelledby={`registration-${index}-birth-label`} aria-describedby={`registration-${index}-birth-note`}>
                    <p id={`registration-${index}-birth-label`} className="text-sm font-bold">&#x51fa;&#x751f;&#x5e74;&#x6708;&#x65e5;</p>
                    <div className="grid grid-cols-3 gap-2">
                      <label className="text-xs text-slate-500">&#x5e74;<select required aria-label={`\u5b78\u751f ${index + 1} \u51fa\u751f\u5e74`} className={inputClass} value={student.birthYear} onChange={e => updateBirthday(index, 'birthYear', e.target.value)}><option value="">&#x5e74;</option>{Array.from({ length: 121 }, (_, i) => currentYear - i).map(year => <option key={year} value={year}>{year}</option>)}</select></label>
                      <label className="text-xs text-slate-500">&#x6708;<select required aria-label={`\u5b78\u751f ${index + 1} \u51fa\u751f\u6708`} className={inputClass} value={student.birthMonth} onChange={e => updateBirthday(index, 'birthMonth', e.target.value)}><option value="">&#x6708;</option>{Array.from({ length: 12 }, (_, i) => i + 1).map(month => <option key={month} value={month}>{month}</option>)}</select></label>
                      <label className="text-xs text-slate-500">&#x65e5;<select required aria-label={`\u5b78\u751f ${index + 1} \u51fa\u751f\u65e5`} className={inputClass} value={student.birthDay} onChange={e => updateBirthday(index, 'birthDay', e.target.value)}><option value="">&#x65e5;</option>{Array.from({ length: student.birthYear && student.birthMonth ? new Date(Number(student.birthYear), Number(student.birthMonth), 0).getDate() : 31 }, (_, i) => i + 1).map(day => <option key={day} value={day}>{day}</option>)}</select></label>
                    </div>
                    <p id={`registration-${index}-birth-note`} className={noteClass}>{REGISTRATION_NOTES.birthDate}</p>
                  </div>
                  <label className="block text-sm font-bold">&#x624b;&#x6a5f;&#x865f;&#x78bc;{index > 0 && '\uff08\u9078\u586b\uff09'}<input required={index === 0} type="tel" autoComplete="tel" maxLength="20" aria-describedby={`registration-${index}-phone-note`} className={inputClass} value={student.phone} onChange={e => updateStudent(index, 'phone', e.target.value)} /><span id={`registration-${index}-phone-note`} className={noteClass}>{REGISTRATION_NOTES.phone}</span></label>
                  <label className="block text-sm font-bold">&#x50b7;&#x75c5;&#x53f2;&#xff08;&#x9078;&#x586b;&#xff09;<textarea maxLength="2000" rows="3" aria-describedby={`registration-${index}-injury-note`} className={inputClass} value={student.injuryHistory} onChange={e => updateStudent(index, 'injuryHistory', e.target.value)} /><span id={`registration-${index}-injury-note`} className={noteClass}>{REGISTRATION_NOTES.injuryHistory}</span></label>
                  <label className="block text-sm font-bold">&#x7dca;&#x6025;&#x9023;&#x7d61;&#x4eba;&#x96fb;&#x8a71;{index > 0 && '\uff08\u9078\u586b\uff09'}<input required={index === 0} type="tel" maxLength="20" aria-describedby={`registration-${index}-emergency-note`} className={inputClass} value={student.emergencyPhone} onChange={e => updateStudent(index, 'emergencyPhone', e.target.value)} /><span id={`registration-${index}-emergency-note`} className={noteClass}>{REGISTRATION_NOTES.emergencyPhone}</span></label>
                  <label className="registration-goals block text-sm font-bold">&#x5b78;&#x7fd2;&#x76ee;&#x6a19;<textarea required maxLength="2000" rows="3" aria-describedby={`registration-${index}-goals-note`} className={inputClass} value={student.learningGoals} onChange={e => updateStudent(index, 'learningGoals', e.target.value)} /><span id={`registration-${index}-goals-note`} className={noteClass}>{REGISTRATION_NOTES.learningGoals}</span></label>
                  <div role="group" aria-labelledby={`registration-${index}-style-label`} className="registration-style bg-slate-50 rounded-lg p-3 space-y-4">
                    <p id={`registration-${index}-style-label`} className="text-sm font-bold">&#x504f;&#x597d;&#x4e0a;&#x8ab2;&#x98a8;&#x683c;</p>
                    <p className={noteClass}>{REGISTRATION_NOTES.lessonStyle}</p>
                    {LESSON_STYLE_OPTIONS.map(([key, label, note]) => <label key={key} className="block text-sm font-bold">
                      <span className="flex items-start justify-between gap-2"><span>{label}</span><output className="shrink-0 tabular-nums" htmlFor={`registration-${index}-${key}`}>{student.lessonStyle[key]}%</output></span>
                      <input id={`registration-${index}-${key}`} type="range" min="0" max="100" step="1" aria-label={`\u5b78\u751f ${index + 1} ${label}`} aria-describedby={`registration-${index}-${key}-note`} className="w-full accent-emerald-600 mt-2" value={student.lessonStyle[key]} onChange={e => updateStudent(index, 'lessonStyle', rebalanceLessonStyle(student.lessonStyle, key, e.target.value))} />
                      <span id={`registration-${index}-${key}-note`} className={noteClass}>{note}</span>
                    </label>)}
                    <p role="status" className="text-sm font-bold text-emerald-800">&#x5408;&#x8a08;&#xff1a;{Object.values(student.lessonStyle).reduce((sum, value) => sum + value, 0)}%</p>
                    <p className={noteClass}>&#x62d6;&#x52d5;&#x4efb;&#x4e00;&#x9805;&#x6642;&#xff0c;&#x5176;&#x9918;&#x5169;&#x9805;&#x6703;&#x81ea;&#x52d5;&#x6309;&#x6bd4;&#x4f8b;&#x8abf;&#x6574;&#xff0c;&#x5408;&#x8a08; 100%&#x3002;</p>
                  </div>
                </fieldset>)}
                <button type="submit" disabled={submitting} className="w-full bg-slate-800 text-white p-4 mt-4 rounded-lg font-bold text-lg hover:bg-slate-700 transition active:scale-[0.98]">{submitting ? '\u8655\u7406\u4e2d...' : (existingUser ? '\u5132\u5b58\u5b78\u751f\u8cc7\u6599' : '\u78ba\u8a8d\u7d81\u5b9a')}</button>
                {onCancel && <button type="button" disabled={submitting} onClick={onCancel} className="w-full border p-3 rounded-lg">&#x8fd4;&#x56de;</button>}
              </form>
            </div>
          );
        };

        const splitCoachHours = (start, end) => {
            const minutes = value => {
                const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
                if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw new Error('\u8acb\u9078\u64c7\u6709\u6548\u7684\u958b\u59cb\u8207\u7d50\u675f\u6642\u9593\u3002');
                return Number(match[1]) * 60 + Number(match[2]);
            };
            const from = minutes(start), to = minutes(end);
            if (to <= from) throw new Error('\u7d50\u675f\u6642\u9593\u5fc5\u9808\u665a\u65bc\u958b\u59cb\u6642\u9593\uff0c\u4e0d\u652f\u63f4\u8de8\u65e5\u8a2d\u5b9a\u3002');
            if ((to - from) % 60 !== 0) throw new Error('\u6559\u7df4\u6642\u6bb5\u4ee5\u6bcf\u5c0f\u6642\u5206\u5272\uff0c\u7e3d\u6642\u9577\u9700\u70ba\u6574\u5c0f\u6642\uff0c\u8acb\u8abf\u6574\u7d50\u675f\u6642\u9593\u3002');
            const format = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
            return Array.from({ length: (to - from) / 60 }, (_, i) => `${format(from + i * 60)} - ${format(from + (i + 1) * 60)}`);
        };

        const BOOKING_AGREEMENTS = [
            ['\u9810\u7d04\u78ba\u8a8d', '\u70ba\u4e86\u78ba\u4fdd\u6bcf\u5802\u8ab2\u7684\u6559\u5b78\u54c1\u8cea\uff0c\u9001\u51fa\u9810\u7d04\u767b\u8a18\u5f8c\uff0c\u9700\u7d93\u7531\u6211\u5011\u78ba\u8a8d\uff0c\u4e26\u6536\u5230\u9810\u7d04\u6210\u529f\u901a\u77e5\uff0c\u624d\u7b97\u771f\u6b63\u5b8c\u6210\u9810\u7d04\u5594\uff01'],
            ['\u958b\u8ab2\u9580\u6abb', '\u5927\u5bb6\u4e00\u8d77\u7df4\u7403\u6700\u6709\u6c23\u6c1b\uff01\u82e5\u8a72\u9810\u7d04\u6642\u6bb5\u672a\u9054\u57fa\u672c\u958b\u8ab2\u4eba\u6578\uff0c\u8ab2\u7a0b\u5c07\u6703\u53d6\u6d88\uff0c\u6211\u5011\u4e5f\u6703\u901a\u77e5\u60a8\uff0c\u4e26\u5354\u52a9\u8fa6\u7406\u7576\u6b21\u8ab2\u7a0b\u7684\u5168\u984d\u9000\u8cbb\u3002'],
            ['\u8acb\u5047\u898f\u7bc4', '\u56e0\u70ba\u5834\u5730\u8207\u6559\u7df4\u7684\u6642\u9593\u7686\u5df2\u70ba\u60a8\u5c08\u5c6c\u4fdd\u7559\uff0c\u82e5\u60a8\u56e0\u500b\u4eba\u56e0\u7d20\u9700\u8acb\u5047\u6216\u53d6\u6d88\u9810\u7d04\uff0c\u5c07\u7121\u6cd5\u53e6\u884c\u9000\u8cbb\uff0c\u518d\u8acb\u5927\u5bb6\u591a\u591a\u5305\u6db5\u3002\u56fa\u5b9a\u5718\u8ab2\u5b78\u54e1\u82e5\u63d0\u524d\u5169\u9031\u5b8c\u6210\u8acb\u5047\uff0c\u53ef\u8207\u6211\u5011\u5354\u8abf\u53e6\u5916\u5b89\u6392\u6642\u6bb5\u88dc\u8ab2\u3002'],
            ['\u6559\u7df4\u6216\u5834\u5730\u81e8\u6642\u7570\u52d5', '\u82e5\u56e0\u6559\u7df4\u81e8\u6642\u6709\u4e8b\uff0c\u6216\u5834\u5730\u5b89\u6392\u7570\u52d5\u7b49\u4e3b\u8fa6\u65b9\u56e0\u7d20\uff0c\u5c0e\u81f4\u7576\u6b21\u8ab2\u7a0b\u7121\u6cd5\u5982\u671f\u9032\u884c\uff0c\u6211\u5011\u5c07\u5118\u65e9\u901a\u77e5\u60a8\uff0c\u4e26\u8fa6\u7406\u7576\u6b21\u8ab2\u7a0b\u7684\u5168\u984d\u9000\u8cbb\uff0c\u8b1d\u8b1d\u60a8\u7684\u9ad4\u8ad2\uff01'],
            ['\u5929\u707d\u505c\u8ab2', '\u5b89\u5168\u6c38\u9060\u662f\u7b2c\u4e00\u8003\u91cf\uff01\u82e5\u9047\u98b1\u98a8\u7b49\u5929\u707d\uff0c\u4e0a\u8ab2\u6240\u5728\u5730\u653f\u5e9c\u516c\u544a\u505c\u73ed\u6216\u505c\u8ab2\uff0c\u6216\u5834\u5730\u56e0\u5929\u707d\u7121\u6cd5\u4f7f\u7528\u6642\uff0c\u7576\u6b21\u8ab2\u7a0b\u5c07\u6703\u53d6\u6d88\u3002\u6211\u5011\u5c07\u5118\u65e9\u901a\u77e5\u60a8\uff0c\u4e26\u8207\u60a8\u5354\u8abf\u5b89\u6392\u88dc\u8ab2\uff1b\u82e5\u7121\u6cd5\u914d\u5408\u88dc\u8ab2\u6642\u6bb5\uff0c\u4e5f\u53ef\u9078\u64c7\u8fa6\u7406\u7576\u6b21\u8ab2\u7a0b\u7684\u5168\u984d\u9000\u8cbb\u3002\u8acb\u5927\u5bb6\u5b89\u5fc3\uff0c\u4e5f\u8a18\u5f97\u7167\u9867\u597d\u81ea\u5df1\u7684\u5b89\u5168\u5594\uff01'],
            ['\u4e92\u76f8\u5c0a\u91cd', '\u6211\u5011\u975e\u5e38\u73cd\u60dc\u6bcf\u6b21\u8207\u5927\u5bb6\u5728\u7403\u5834\u4ea4\u6d41\u7684\u6a5f\u6703\u3002\u82e5\u9810\u7d04\u5f8c\u7121\u6545\u7f3a\u5e2d\u4e14\u672a\u63d0\u524d\u8acb\u5047\uff0c\u70ba\u4e86\u4fdd\u969c\u5176\u4ed6\u7403\u53cb\u7684\u6b0a\u76ca\uff0c\u6211\u5011\u5c07\u8996\u60c5\u6cc1\u66ab\u505c\u53d7\u7406\u60a8\u5f8c\u7e8c\u7684\u9810\u7d04\u3002']
        ];
        const BookingAgreement = ({ target, onCancel, onContinue }) => {
            const [reachedEnd, setReachedEnd] = useState(false);
            const [accepted, setAccepted] = useState(false);
            const contentRef = React.useRef(null);
            const checkEnd = () => {
                const el = contentRef.current;
                if (el && el.clientHeight > 0 && el.scrollHeight - el.scrollTop - el.clientHeight <= 3) setReachedEnd(true);
            };
            useEffect(() => {
                const el = contentRef.current;
                if (!el) return;
                el.focus(); checkEnd();
                const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(checkEnd) : null;
                if (observer) observer.observe(el);
                return () => { if (observer) observer.disconnect(); };
            }, []);
            return <div className="fixed inset-0 z-50 bg-slate-900 bg-opacity-60 flex items-center justify-center p-3 md:p-4">
                <div role="dialog" aria-modal="true" aria-labelledby="booking-agreement-title" className="bg-white rounded-2xl shadow-xl w-full min-w-0 max-w-2xl max-h-[90dvh] flex flex-col overflow-hidden">
                    <header className="bg-slate-800 text-white p-4 shrink-0">
                        <h2 id="booking-agreement-title" className="font-bold text-lg">&#x9810;&#x7d04;&#x524d;&#xff0c;&#x8acb;&#x8a73;&#x95b1;&#x8ab2;&#x524d;&#x5c0f;&#x7d04;&#x5b9a;</h2>
                        <p className="text-sm mt-1 text-slate-200">{target.titleDisplay} &#xb7; {target.slot.date} {target.slot.time}</p>
                    </header>
                    <div ref={contentRef} tabIndex="0" role="region" aria-label="&#x8ab2;&#x524d;&#x5c0f;&#x7d04;&#x5b9a;&#x5168;&#x6587;" onScroll={checkEnd} className="min-h-0 overflow-y-auto overscroll-contain p-4 md:p-6 space-y-5 text-sm md:text-base leading-relaxed text-gray-700">
                        <p>&#x6211;&#x5011;&#x7684;&#x521d;&#x8877;&#x5f88;&#x7c21;&#x55ae;&#xff1a;&#x5e0c;&#x671b;&#x900f;&#x904e;&#x5c08;&#x696d;&#x3001;&#x9ad8;&#x54c1;&#x8cea;&#x7684;&#x7fbd;&#x7403;&#x6559;&#x5b78;&#xff0c;&#x8b93;&#x6bcf;&#x500b;&#x4eba;&#x90fd;&#x80fd;&#x8f15;&#x9b06;&#x9ad4;&#x6703;&#x7fbd;&#x7403;&#x7684;&#x9b45;&#x529b;&#xff01;</p>
                        <p><strong className="text-slate-900">&#x6211;&#x5011;&#x7684;&#x5718;&#x73ed;&#x63a1;&#x7528;&#x4f9d;&#x500b;&#x4eba;&#x7a0b;&#x5ea6;&#x5ba2;&#x88fd;&#x5316;&#x7684;&#x6559;&#x5b78;&#x65b9;&#x5f0f;&#xff0c;&#x544a;&#x5225;&#x50b3;&#x7d71;&#x5168;&#x73ed;&#x7d71;&#x4e00;&#x8ab2;&#x8868;&#xff0c;&#x4f9d;&#x7167;&#x6bcf;&#x4f4d;&#x5b78;&#x54e1;&#x7684;&#x57fa;&#x790e;&#x3001;&#x5b78;&#x7fd2;&#x9032;&#x5ea6;&#x8207;&#x9700;&#x8981;&#x52a0;&#x5f37;&#x7684;&#x5730;&#x65b9;&#xff0c;&#x5b89;&#x6392;&#x9069;&#x5408;&#x7684;&#x7df4;&#x7fd2;&#x5167;&#x5bb9;&#x3002;</strong>&#x8b93;&#x5927;&#x5bb6;&#x4e00;&#x8d77;&#x7df4;&#x7403;&#xff0c;&#x4e5f;&#x80fd;&#x6309;&#x7167;&#x81ea;&#x5df1;&#x7684;&#x6b65;&#x8abf;&#xff0c;&#x4eab;&#x53d7;&#x5b78;&#x7fd2;&#x8207;&#x9032;&#x6b65;&#x7684;&#x6a02;&#x8da3;&#xff01;</p>
                        <p>&#x70ba;&#x4e86;&#x7dad;&#x6301;&#x826f;&#x597d;&#x7684;&#x6559;&#x5b78;&#x54c1;&#x8cea;&#xff0c;&#x4e26;&#x8b93;&#x6bcf;&#x4e00;&#x5802;&#x8ab2;&#x90fd;&#x80fd;&#x9806;&#x5229;&#x9032;&#x884c;&#xff0c;&#x9810;&#x7d04;&#x524d;&#x8acb;&#x5927;&#x5bb6;&#x5148;&#x5e6b;&#x6211;&#x5011;&#x8a73;&#x95b1;&#x4ee5;&#x4e0b;&#x5e7e;&#x9ede;&#x300c;&#x8ab2;&#x524d;&#x5c0f;&#x7d04;&#x5b9a;&#x300d;&#x5594;&#xff01;</p>
                        {BOOKING_AGREEMENTS.map(([title, text]) => <section key={title}><h3 className="font-bold text-emerald-800 mb-2">&#x3010;{title}&#x3011;</h3><p>{text}</p></section>)}
                        <p>&#x671f;&#x5f85;&#x80fd;&#x5728;&#x7403;&#x5834;&#x4e0a;&#x8207;&#x5927;&#x5bb6;&#x76f8;&#x898b;&#xff01;&#x5e0c;&#x671b;&#x900f;&#x904e;&#x6bcf;&#x4e00;&#x5802;&#x8ab2;&#xff0c;&#x966a;&#x4f34;&#x60a8;&#x9010;&#x6b65;&#x638c;&#x63e1;&#x66f4;&#x6d41;&#x66a2;&#x3001;&#x66f4;&#x5408;&#x7406;&#x7684;&#x64ca;&#x7403;&#x52d5;&#x4f5c;&#x8207;&#x77e5;&#x8b58;&#xff0c;&#x4e5f;&#x8b93;&#x60a8;&#x5728;&#x63ee;&#x7051;&#x6c57;&#x6c34;&#x7684;&#x904e;&#x7a0b;&#x4e2d;&#xff0c;&#x6536;&#x7a6b;&#x6eff;&#x6eff;&#x7684;&#x5065;&#x5eb7;&#x8207;&#x6b61;&#x7b11;&#xff0c;&#x771f;&#x6b63;&#x4eab;&#x53d7;&#x7fbd;&#x7403;&#x5e36;&#x4f86;&#x7684;&#x7d14;&#x7cb9;&#x6a02;&#x8da3;&#xff01;</p>
                    </div>
                    <footer className="border-t p-4 shrink-0 space-y-3 bg-white">
                        <p role="status" className="text-xs text-gray-600">{reachedEnd ? '\u5df2\u700f\u89bd\u81f3\u6587\u672b\uff0c\u8acb\u52fe\u9078\u78ba\u8a8d\u5f8c\u7e7c\u7e8c\u3002' : '\u8acb\u5411\u4e0b\u6372\u52d5\u81f3\u6587\u672b\uff0c\u95b1\u8b80\u5b8c\u6574\u5167\u5bb9\u5f8c\u624d\u80fd\u7e7c\u7e8c\u3002'}</p>
                        <label className={`flex items-start gap-3 text-sm font-bold p-2 ${reachedEnd ? 'text-slate-800' : 'text-gray-400'}`}>
                            <input type="checkbox" disabled={!reachedEnd} checked={accepted} onChange={e => setAccepted(e.target.checked)} className="mt-1 w-5 h-5 shrink-0 accent-emerald-600" />
                            <span>&#x6211;&#x5df2;&#x95b1;&#x8b80;&#x4e26;&#x540c;&#x610f;&#x4ee5;&#x4e0a;&#x8ab2;&#x524d;&#x5c0f;&#x7d04;&#x5b9a;</span>
                        </label>
                        <div className="flex gap-3"><button onClick={onCancel} className="flex-1 min-w-0 border rounded-lg p-3 font-bold text-gray-600">&#x8fd4;&#x56de;&#x9078;&#x8ab2;</button><button disabled={!reachedEnd || !accepted} onClick={() => { if (reachedEnd && accepted) onContinue(); }} className="flex-1 min-w-0 bg-emerald-700 text-white rounded-lg p-3 font-bold disabled:opacity-40">&#x7e7c;&#x7e8c;&#x9810;&#x7d04;</button></div>
                    </footer>
                </div>
            </div>;
        };

        const StudentBookingTracking = ({ lineId, students, revision }) => {
            const [groups, setGroups] = useState([]);
            const [loading, setLoading] = useState(true);
            const [error, setError] = useState('');
            const requestRef = React.useRef(0);
            const fetchTracking = async () => {
                const requestId = ++requestRef.current;
                setLoading(true); setError('');
                try {
                    if (!lineId) throw new Error('\u7121\u6cd5\u78ba\u8a8d\u5e33\u865f\uff0c\u8acb\u91cd\u65b0\u767b\u5165\u3002');
                    const results = await Promise.all(students.map(async student => {
                        const result = await fetchAPI({ action: 'getStudentStats', lineId, studentId: student.id });
                        if (result.status !== 'success' || !Array.isArray(result.bookings)) throw new Error(result.message || '\u9810\u7d04\u7d00\u9304\u8b80\u53d6\u5931\u6557\uff0c\u8acb\u91cd\u8a66\u3002');
                        return { student, bookings: result.bookings };
                    }));
                    if (requestId === requestRef.current) setGroups(results);
                } catch (error) {
                    if (requestId === requestRef.current) setError(error.message);
                } finally {
                    if (requestId === requestRef.current) setLoading(false);
                }
            };
            useEffect(() => {
                fetchTracking();
                return () => { requestRef.current++; };
            }, [lineId, students, revision]);
            return <section aria-labelledby="booking-tracking-title" className="m-4 md:mx-8 mb-8 bg-white rounded-2xl shadow-sm border p-5 md:p-6">
                <h3 id="booking-tracking-title" className="font-bold text-slate-800 mb-4 text-base md:text-lg">&#x8ffd;&#x8e64;&#x4e2d;&#x9810;&#x7d04;&#x55ae; <span className="text-xs text-gray-400 font-normal">&#xff08;&#x5b8c;&#x8ab2;&#x5f8c;&#x81ea;&#x52d5;&#x96b1;&#x85cf;&#xff09;</span></h3>
                {loading ? <p role="status" className="text-gray-500">&#x8b80;&#x53d6;&#x9810;&#x7d04;&#x7d00;&#x9304;&#x4e2d;...</p> : error ? <div role="alert"><p>{error}</p><button onClick={fetchTracking} className="mt-3 border rounded-lg p-3">&#x91cd;&#x65b0;&#x8b80;&#x53d6;&#x9810;&#x7d04;&#x55ae;</button></div> : <div className="tracking-groups space-y-6">
                    {groups.map(({ student, bookings }, index) => <div key={student.id}>
                        <h4 className="font-bold text-slate-700 mb-3">{studentNickname(student, index)}</h4>
                        <div className="space-y-4">{bookings.length === 0 ? <p className="text-gray-400 text-sm">&#x76ee;&#x524d;&#x5c1a;&#x7121;&#x672a;&#x7d50;&#x6848;&#x4e4b;&#x9810;&#x7d04;&#x7d00;&#x9304;</p> : bookings.map((booking, index) => <BookingStatusItem key={booking.bookingId || `${student.id}-${index}`} booking={booking} onUpdate={fetchTracking} />)}</div>
                    </div>)}
                </div>}
            </section>;
        };

        const BookingBrandIntroduction = () => (
            <article aria-label="&#x6a02;&#x52d5;&#x7fbd;&#x7403;&#x54c1;&#x724c;&#x4ecb;&#x7d39;" className="m-4 md:mx-8 mt-5 md:mt-8 p-5 md:p-8 bg-white rounded-2xl border border-amber-100 border-t-4 border-t-amber-500 shadow-sm text-slate-700">
                <h3 className="text-lg md:text-2xl font-bold leading-relaxed text-slate-900 mb-5">&#x6211;&#x5011;&#x76f8;&#x4fe1;&#xff0c;&#x904b;&#x52d5;&#x7684;&#x50f9;&#x503c;&#x4e0d;&#x53ea;&#x5728;&#x65bc;&#x6280;&#x8853;&#x7684;&#x63d0;&#x5347;&#xff0c;&#x66f4;&#x5728;&#x65bc;&#x904e;&#x7a0b;&#x4e2d;&#x7684;&#x5feb;&#x6a02;&#x3001;&#x5065;&#x5eb7;&#x8207;&#x6210;&#x9577;&#x3002;</h3>
                <div className="space-y-3 text-sm md:text-base leading-7">
                    <p>&#x6a02;&#x52d5;&#x7fbd;&#x7403;&#x81f4;&#x529b;&#x65bc;&#x6253;&#x9020;&#x4e00;&#x500b;&#x80fd;&#x5920;&#x8f15;&#x9b06;&#x63a5;&#x89f8;&#x3001;&#x81ea;&#x5728;&#x5b78;&#x7fd2;&#x3001;&#x6301;&#x7e8c;&#x4eab;&#x53d7;&#x7684;&#x7fbd;&#x7403;&#x6559;&#x5b78;&#x74b0;&#x5883;&#x3002;</p>
                    <p>&#x6211;&#x5011;&#x4e0d;&#x8ffd;&#x6c42;&#x67af;&#x71e5;&#x4e4f;&#x5473;&#x7684;&#x82e6;&#x7df4;&#xff0c;&#x4e5f;&#x4e0d;&#x4ee5;&#x6bcf;&#x500b;&#x4eba;&#x90fd;&#x5fc5;&#x9808;&#x6210;&#x70ba;&#x7af6;&#x6280;&#x9078;&#x624b;&#x70ba;&#x76ee;&#x6a19;&#x3002;</p>
                    <p>&#x6211;&#x5011;&#x5e0c;&#x671b;&#x900f;&#x904e;&#x79d1;&#x5b78;&#x5316;&#x7684;&#x6559;&#x5b78;&#x65b9;&#x5f0f;&#xff0c;&#x8b93;&#x6bcf;&#x4f4d;&#x5b78;&#x54e1;&#x7406;&#x89e3;&#x52d5;&#x4f5c;&#x3001;&#x8a8d;&#x8b58;&#x81ea;&#x5df1;&#x7684;&#x8eab;&#x9ad4;&#xff0c;&#x5728;&#x4eab;&#x53d7;&#x904b;&#x52d5;&#x6a02;&#x8da3;&#x7684;&#x540c;&#x6642;&#xff0c;&#x9010;&#x6b65;&#x5efa;&#x7acb;&#x6b63;&#x78ba;&#x7684;&#x7fbd;&#x7403;&#x6280;&#x8853;&#x3002;</p>
                </div>
                <section aria-labelledby="brand-teaching-features" className="mt-7">
                    <h4 id="brand-teaching-features" className="text-base md:text-lg font-bold text-slate-900 mb-4">&#x6211;&#x5011;&#x7684;&#x6559;&#x5b78;&#x7279;&#x8272;</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-amber-50 rounded-xl p-4 min-w-0">
                            <h5 className="font-bold text-amber-900 mb-2">&#x56e0;&#x6750;&#x65bd;&#x6559;&#xff0c;&#x800c;&#x975e;&#x7d71;&#x4e00;&#x8ab2;&#x8868;</h5>
                            <p className="text-sm md:text-base leading-7">&#x5c0a;&#x91cd;&#x6bcf;&#x4f4d;&#x5b78;&#x54e1;&#x7684;&#x9ad4;&#x80fd;&#x3001;&#x7a0b;&#x5ea6;&#x8207;&#x5b78;&#x7fd2;&#x901f;&#x5ea6;&#xff0c;&#x4f9d;&#x7167;&#x500b;&#x4eba;&#x9700;&#x6c42;&#x8abf;&#x6574;&#x8a13;&#x7df4;&#x5167;&#x5bb9;&#xff0c;&#x8b93;&#x6bcf;&#x500b;&#x4eba;&#x90fd;&#x80fd;&#x627e;&#x5230;&#x9069;&#x5408;&#x81ea;&#x5df1;&#x7684;&#x5b78;&#x7fd2;&#x65b9;&#x5f0f;&#x3002;</p>
                        </div>
                        <div className="bg-amber-50 rounded-xl p-4 min-w-0">
                            <h5 className="font-bold text-amber-900 mb-2">&#x79d1;&#x5b78;&#x6559;&#x5b78;&#xff0c;&#x800c;&#x975e;&#x76f2;&#x76ee;&#x82e6;&#x7df4;</h5>
                            <p className="text-sm md:text-base leading-7">&#x91cd;&#x8996;&#x4eba;&#x9ad4;&#x52d5;&#x4f5c;&#x539f;&#x7406;&#x3001;&#x8eab;&#x9ad4;&#x5354;&#x8abf;&#x8207;&#x6b63;&#x78ba;&#x767c;&#x529b;&#xff0c;&#x900f;&#x904e;&#x6709;&#x76ee;&#x7684;&#x3001;&#x6709;&#x65b9;&#x6cd5;&#x7684;&#x7df4;&#x7fd2;&#x63d0;&#x5347;&#x5b78;&#x7fd2;&#x6548;&#x7387;&#xff0c;&#x4e26;&#x91cd;&#x8996;&#x904b;&#x52d5;&#x5b89;&#x5168;&#x3002;</p>
                        </div>
                        <div className="bg-amber-50 rounded-xl p-4 min-w-0">
                            <h5 className="font-bold text-amber-900 mb-2">&#x4eab;&#x53d7;&#x904e;&#x7a0b;&#xff0c;&#x800c;&#x975e;&#x53ea;&#x6709;&#x7d50;&#x679c;</h5>
                            <p className="text-sm md:text-base leading-7">&#x6211;&#x5011;&#x76f8;&#x4fe1;&#xff0c;&#x771f;&#x6b63;&#x80fd;&#x8b93;&#x4eba;&#x6301;&#x7e8c;&#x904b;&#x52d5;&#x7684;&#x52d5;&#x529b;&#xff0c;&#x4f86;&#x81ea;&#x5feb;&#x6a02;&#x8207;&#x6210;&#x5c31;&#x611f;&#x3002;&#x6bcf;&#x4e00;&#x6b21;&#x6210;&#x529f;&#x64ca;&#x7403;&#x3001;&#x6bcf;&#x4e00;&#x500b;&#x52d5;&#x4f5c;&#x7684;&#x6539;&#x5584;&#xff0c;&#x90fd;&#x662f;&#x503c;&#x5f97;&#x4eab;&#x53d7;&#x7684;&#x9032;&#x6b65;&#x3002;</p>
                        </div>
                        <div className="bg-amber-50 rounded-xl p-4 min-w-0">
                            <h5 className="font-bold text-amber-900 mb-2">&#x5fc3;&#x61f7;&#x611f;&#x6069;&#xff0c;&#x73cd;&#x60dc;&#x6bcf;&#x6b21;&#x76f8;&#x9047;</h5>
                            <p className="text-sm md:text-base leading-7">&#x611f;&#x8b1d;&#x6bcf;&#x4e00;&#x4f4d;&#x9858;&#x610f;&#x6295;&#x5165;&#x6642;&#x9593;&#x5b78;&#x7fd2;&#x7684;&#x5b78;&#x54e1;&#xff0c;&#x73cd;&#x60dc;&#x5f7c;&#x6b64;&#x7684;&#x4fe1;&#x4efb;&#x8207;&#x966a;&#x4f34;&#x3002;&#x8b93;&#x7fbd;&#x7403;&#x4e0d;&#x53ea;&#x662f;&#x904b;&#x52d5;&#xff0c;&#x66f4;&#x6210;&#x70ba;&#x9023;&#x7d50;&#x4eba;&#x8207;&#x4eba;&#x3001;&#x8c50;&#x5bcc;&#x751f;&#x6d3b;&#x7684;&#x6a4b;&#x6881;&#x3002;</p>
                        </div>
                    </div>
                </section>
                <section aria-labelledby="brand-vision" className="mt-7 text-sm md:text-base leading-7">
                    <h4 id="brand-vision" className="text-base md:text-lg font-bold text-slate-900 mb-3">&#x6211;&#x5011;&#x7684;&#x9858;&#x666f;</h4>
                    <p>&#x8b93;&#x66f4;&#x591a;&#x4eba;&#x4e0d;&#x53d7;&#x5e74;&#x9f61;&#x8207;&#x7a0b;&#x5ea6;&#x9650;&#x5236;&#xff0c;&#x90fd;&#x80fd;&#x900f;&#x904e;&#x79d1;&#x5b78;&#x3001;&#x5065;&#x5eb7;&#x800c;&#x5feb;&#x6a02;&#x7684;&#x7fbd;&#x7403;&#x5b78;&#x7fd2;&#xff0c;&#x57f9;&#x990a;&#x7d42;&#x8eab;&#x904b;&#x52d5;&#x7684;&#x7fd2;&#x6163;&#x3002;</p>
                    <p className="font-bold text-amber-900 mt-4">&#x4ee5;&#x5feb;&#x6a02;&#x70ba;&#x521d;&#x5fc3;&#xff0c;&#x4ee5;&#x5065;&#x5eb7;&#x70ba;&#x6839;&#x672c;&#xff0c;&#x4ee5;&#x79d1;&#x5b78;&#x70ba;&#x65b9;&#x6cd5;&#xff0c;&#x4ee5;&#x904b;&#x52d5;&#x70ba;&#x5be6;&#x8e10;&#xff0c;&#x4ee5;&#x611f;&#x6069;&#x70ba;&#x614b;&#x5ea6;&#x3002;</p>
                    <p className="text-slate-800 mt-3">&#x6a02;&#x52d5;&#x7fbd;&#x7403;&#xff0c;&#x8b93;&#x6bcf;&#x4e00;&#x6b21;&#x63ee;&#x62cd;&#xff0c;&#x90fd;&#x6210;&#x70ba;&#x751f;&#x6d3b;&#x4e2d;&#x7684;&#x7f8e;&#x597d;&#x6642;&#x523b;&#x3002;</p>
                </section>
            </article>
        );

        const BookingInstructions = () => (
            <section aria-labelledby="booking-instructions-title" className="m-4 md:mx-8 p-5 md:p-6 bg-emerald-50 rounded-2xl border border-emerald-100 text-slate-700">
                <h3 id="booking-instructions-title" className="text-lg md:text-xl font-bold leading-relaxed text-emerald-900 mb-4">&#x1f4c5; &#x53ea;&#x8981;&#x7c21;&#x55ae;&#x5e7e;&#x500b;&#x6b65;&#x9a5f;&#xff0c;&#x5c31;&#x80fd;&#x8f15;&#x9b06;&#x5b8c;&#x6210;&#x8ab2;&#x7a0b;&#x9810;&#x7d04;&#xff01;</h3>
                <ol className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <li className="bg-white rounded-xl p-4 min-w-0">
                        <h4 className="font-bold text-emerald-900 mb-2">&#x2460; &#x9078;&#x64c7;&#x4e0a;&#x8ab2;&#x65e5;&#x671f;</h4>
                        <p className="text-sm md:text-base leading-7">&#x9ede;&#x9078;&#x884c;&#x4e8b;&#x66c6;&#x4e0a;&#x6709;&#x958b;&#x8ab2;&#x7684;&#x65e5;&#x671f;&#xff0c;&#x9078;&#x64c7;&#x60a8;&#x60f3;&#x8981;&#x4e0a;&#x8ab2;&#x7684;&#x6642;&#x9593;&#x3002;</p>
                    </li>
                    <li className="bg-white rounded-xl p-4 min-w-0">
                        <h4 className="font-bold text-emerald-900 mb-2">&#x2461; &#x9078;&#x64c7;&#x8ab2;&#x7a0b;&#x4e26;&#x5b8c;&#x6210;&#x9810;&#x7d04;</h4>
                        <p className="text-sm md:text-base leading-7">&#x5728;&#x53ef;&#x9810;&#x7d04;&#x6642;&#x6bb5;&#xff0c;&#x9078;&#x53d6;&#x8a72;&#x65e5;&#x671f;&#x60f3;&#x8981;&#x53c3;&#x52a0;&#x7684;&#x8ab2;&#x7a0b;&#xff0c;&#x4f9d;&#x7167;&#x6307;&#x793a;&#x5b8c;&#x6210;&#x9810;&#x7d04;&#x3002;</p>
                    </li>
                    <li className="bg-white rounded-xl p-4 min-w-0">
                        <h4 className="font-bold text-emerald-900 mb-2">&#x2462; &#x5c08;&#x5c6c;&#x6559;&#x7df4;&#x8ab2;&#x6ce8;&#x610f;&#x4e8b;&#x9805;</h4>
                        <p className="text-sm md:text-base leading-7">&#x5c08;&#x5c6c;&#x6559;&#x7df4;&#x8ab2;&#x9700;&#x7531;&#x5b78;&#x54e1;&#x81ea;&#x884c;&#x9810;&#x7d04;&#x7fbd;&#x7403;&#x5834;&#x5730;&#x3002;&#x5982;&#x9700;&#x5354;&#x52a9;&#x9810;&#x7d04;&#x5834;&#x5730;&#xff0c;&#x6b61;&#x8fce;&#x63d0;&#x524d;&#x8aee;&#x8a62;&#x6559;&#x7df4;&#x3002;</p>
                    </li>
                </ol>
            </section>
        );

        const GroupQuotePrices = ({ quote }) => {
            if (!quote?.studentPrices?.length) return null;
            return <div className="group-price-breakdown w-full space-y-2 mt-3 text-sm">
                {quote.studentPrices.map((item, index) => <div key={item.studentId || index} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg bg-slate-50 px-3 py-2">
                    <span className="font-semibold text-slate-700 break-words">{item.label}</span>
                    {item.price < item.regularPrice ? <del className="text-gray-500">&#x539f;&#x50f9; NT$ {item.regularPrice}</del> : <span className="text-gray-500">&#x539f;&#x50f9; NT$ {item.regularPrice}</span>}
                    <span className="font-bold text-emerald-700">{item.price < item.regularPrice ? '\u512a\u60e0\u50f9' : '\u60a8\u7684\u50f9\u683c'} NT$ {item.price}</span>
                </div>)}
            </div>;
        };

        const StudentBookingView = ({ profile, userRecord, onBooked }) => {
          const [slots, setSlots] = useState([]);
          const [supportsSharedCoach, setSupportsSharedCoach] = useState(false);
          const [status, setStatus] = useState('idle');
          const [currentMonth, setCurrentMonth] = useState(new Date());
          const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
          const [studentLocations, setStudentLocations] = useState({}); 
          const [bookingTarget, setBookingTarget] = useState(null);
          const [agreementAccepted, setAgreementAccepted] = useState(false);
          const [paymentCode, setPaymentCode] = useState(''); 
          const studentCount = validateAccountRecord(userRecord).students.length;
          const userLevel = userRecord ? (userRecord.level || 1) : 1;

          useEffect(() => {
            fetchAPI({ action: 'getSlots', lineId: profile ? profile.userId : '' }).then(res => {
                if (res.status !== 'success') { alert(res.message || '\u8ab2\u7a0b\u8b80\u53d6\u5931\u6557'); return; }
                if (res.studentGroupPricingVersion !== 1) { alert('\u500b\u4eba\u5718\u8ab2\u50f9\u683c\u5c1a\u672a\u555f\u7528\uff0c\u8acb\u806f\u7d61\u7ba1\u7406\u54e1\u66f4\u65b0\u5f8c\u7aef\u3002'); return; }
                if (res.monthlyUniformPricingVersion !== 1) { alert('\u6708\u7e73\u7d71\u4e00\u50f9\u683c\u5c1a\u672a\u555f\u7528\uff0c\u8acb\u5148\u66f4\u65b0\u5f8c\u7aef\u3002'); return; }
                const validSlots = (res.slots || []).filter(s => s.id && s.title && s.date);
                setSlots(validSlots);
                setSupportsSharedCoach(res.coachAccountPricingVersion === 1);
            });
          }, []);

          const quotingRef = React.useRef(false);
          const handleBookClick = async (slot, type = null, selectedLoc = null) => {
            if (quotingRef.current || status === 'booking') return;
            quotingRef.current = true; setStatus('quoting');
            try {
                const result = await fetchAPI({ action: 'getBookingQuote', lineId: profile ? profile.userId : '', slotId: slot.id, coachType: type, location: selectedLoc });
                if (result.status !== 'success' || !result.quote?.eligible) throw new Error(result.message || '\u7121\u6cd5\u53d6\u5f97\u8ab2\u7a0b\u5831\u50f9\uff0c\u8acb\u91cd\u65b0\u8b80\u53d6\u3002');
                const quote = result.quote;
                const titleDisplay = type ? `\u5c08\u5c6c\u6559\u7df4\u8ab2 (${type} \u65bc ${selectedLoc})` : slot.title;
                setAgreementAccepted(false);
                setBookingTarget({ slot, titleDisplay, myPrice: quote.totalPrice, quote, type, selectedLoc });
                setPaymentCode('');
            } catch (error) { alert(error.message); }
            finally { quotingRef.current = false; setStatus('idle'); }
          };

          const confirmBooking = async () => {
            if (!bookingTarget || !agreementAccepted || status === 'booking') return;
            setStatus('booking');
            const result = await fetchAPI({
                action: 'bookClass', accountBooking: true,
                slotId: bookingTarget.slot.id, 
                lineId: profile ? profile.userId : '', 
                expectedTotalPrice: bookingTarget.myPrice,
                expectedStudentPrices: bookingTarget.quote.studentPrices,
                coachType: bookingTarget.type, location: bookingTarget.selectedLoc,
                paymentCode: bookingTarget.slot.title.startsWith('[\u5c08\u5c6c\u6559\u7df4\u8ab2]') ? '\u73fe\u5834\u73fe\u91d1' : (paymentCode || '')
            });
            if (result.status !== 'success') { setStatus('idle'); alert(result.message || '\u9810\u7d04\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66'); return; }
            setStatus('success');
            setBookingTarget(null);
            if (onBooked) onBooked();
          };

          const year = currentMonth.getFullYear();
          const month = currentMonth.getMonth();
          const firstDay = new Date(year, month, 1).getDay();
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const allCells = [...Array.from({ length: firstDay }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

          const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
          const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));

          const dailySlots = slots.filter(s => doesSlotMatchDate(s, selectedDate));

          if (status === 'success') return (
            <div className="p-8 text-center bg-white rounded-xl shadow-md m-6 md:m-10 border-t-4 border-emerald-500">
              <h2 className="text-2xl font-bold text-emerald-600 mb-4">&#x9810;&#x7d04;&#x6210;&#x529f;&#xff01;</h2>
              <p className="text-gray-500 mb-6">&#x60a8;&#x7684;&#x8a02;&#x55ae;&#x76ee;&#x524d;&#x70ba;<span className="text-amber-600 font-bold mx-1">&#x5be9;&#x6838;&#x4e2d;</span><br/>&#x53ef;&#x5728;&#x672c;&#x9801;&#x4e0b;&#x65b9;&#x300c;&#x8ffd;&#x8e64;&#x4e2d;&#x9810;&#x7d04;&#x55ae;&#x300d;&#x67e5;&#x770b;&#x72c0;&#x614b;&#x3002;&#x5c08;&#x5c6c;&#x6559;&#x7df4;&#x8ab2;&#x8acb;&#x65bc;&#x73fe;&#x5834;&#x4ed8;&#x73fe;&#xff1b;&#x5718;&#x8ab2;&#x53ef;&#x5728;&#x9810;&#x7d04;&#x55ae;&#x88dc;&#x767b;&#x532f;&#x6b3e;&#x5f8c;&#x4e94;&#x78bc;&#x3002;</p>
              <button onClick={() => window.location.reload()} className="w-full max-w-xs mx-auto bg-slate-800 text-white py-3 rounded-lg font-bold block transition hover:bg-slate-700">&#x7e7c;&#x7e8c;&#x9810;&#x7d04;</button>
            </div>
          );

          return (
            <div>
            <BookingBrandIntroduction />
            <BookingInstructions />
            {studentCount > 1 && <p className="booking-notice m-4 p-3 rounded-lg bg-emerald-50 text-emerald-900">&#x6b64;&#x5e33;&#x865f;&#x5171; {studentCount} &#x4f4d;&#x5b78;&#x751f;&#x3002;&#x5718;&#x8ab2;&#x9810;&#x7d04;&#x4f54;&#x7528; {studentCount} &#x500b;&#x540d;&#x984d;&#xff0c;&#x8cbb;&#x7528;&#x4f9d;&#x4eba;&#x6578;&#x52a0;&#x7e3d;&#xff1b;&#x5c08;&#x5c6c;&#x6559;&#x7df4;&#x8ab2;&#x9650;&#x540c;&#x5e33;&#x865f; 1&#xff5e;2 &#x4eba;&#xff0c;&#x5171;&#x7528;&#x4e00;&#x500b;&#x540d;&#x984d;&#xff0c;&#x6309;&#x6240;&#x9078;&#x65b9;&#x6848;&#x539f;&#x50f9;&#x6536;&#x8cbb;&#x3002;</p>}
            <div className="booking-layout flex flex-col md:flex-row gap-0 md:gap-8 p-0 md:p-8 pb-10 relative">
              <div className="booking-calendar bg-white px-2 md:px-6 py-4 md:py-6 shadow-sm border-b md:border md:rounded-2xl w-full md:w-1/3 md:sticky md:top-6 h-fit">
                <div className="flex justify-between items-center mb-4 px-4">
                    <button onClick={prevMonth} className="font-bold text-gray-500 hover:text-emerald-600 px-4 py-1 bg-gray-100 rounded active:scale-95">&lt;</button>
                    <div className="font-bold text-lg md:text-xl text-gray-800">{year}&#x5e74; {month + 1}&#x6708;</div>
                    <button onClick={nextMonth} className="font-bold text-gray-500 hover:text-emerald-600 px-4 py-1 bg-gray-100 rounded active:scale-95">&gt;</button>
                </div>
                <div className="grid grid-cols-7 text-center text-xs md:text-sm font-bold text-gray-400 mb-2">
                    <div>&#x65e5;</div><div>&#x4e00;</div><div>&#x4e8c;</div><div>&#x4e09;</div><div>&#x56db;</div><div>&#x4e94;</div><div>&#x516d;</div>
                </div>
                <div role="group" aria-label="&#x8ab2;&#x7a0b;&#x884c;&#x4e8b;&#x66c6;" className="grid grid-cols-7 text-center gap-y-2">
                    {allCells.map((day, i) => {
                      if (!day) return <div key={i} className="h-10"></div>;
                      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                      
                      const availableSlots = slots.filter(slot => doesSlotMatchDate(slot, dateStr) && (slot.title.startsWith('[\u5c08\u5c6c\u6559\u7df4\u8ab2]') ? studentCount <= 2 && Number(slot.remaining) >= 1 : Number(slot.remaining) >= studentCount));
                      const hasAvailableGroupClass = availableSlots.some(slot => !slot.title.startsWith('[\u5c08\u5c6c\u6559\u7df4\u8ab2]'));
                      const hasAvailableCoachSlot = availableSlots.some(slot => slot.title.startsWith('[\u5c08\u5c6c\u6559\u7df4\u8ab2]'));
                      const teachingCoachNames = [...new Set(availableSlots.map(slot => slot.teachingCoachName || '\u672a\u6307\u5b9a'))];
                      
                      if (!hasAvailableGroupClass && !hasAvailableCoachSlot) return <div key={i} className="min-h-[76px]" aria-hidden="true" />;
                      const isSelected = dateStr === selectedDate;
                      const isToday = dateStr === formatDate(new Date());

                      return (
                        <button type="button" key={i} aria-label={`${dateStr} \u53ef\u9810\u7d04`} aria-describedby={`student-calendar-coaches-${dateStr}`} aria-pressed={isSelected} onClick={() => setSelectedDate(dateStr)} className="min-h-[76px] min-w-0 pb-1 flex flex-col items-center justify-start cursor-pointer relative active:scale-90 transition-transform">
                          <span className={`w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-full text-sm md:text-base transition-colors ${isSelected ? 'bg-emerald-600 text-white font-bold shadow-md' : isToday ? 'bg-emerald-100 text-emerald-800 font-bold' : 'text-gray-700 hover:bg-gray-100'}`}>
                            {day}
                          </span>
                          <span className="flex gap-1 mt-1 justify-center w-full">
                              {hasAvailableGroupClass && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>}
                              {hasAvailableCoachSlot && <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>}
                          </span>
                          <span id={`student-calendar-coaches-${dateStr}`} className="mt-1 w-full min-w-0 space-y-0.5 text-[9px] md:text-[10px] leading-tight text-gray-500">
                            {teachingCoachNames.map(name => <span key={name} title={name} className="block truncate px-0.5">{name}</span>)}
                          </span>
                        </button>
                      )
                    })}
                </div>
                <div className="flex justify-center gap-3 md:gap-4 mt-6 text-[10px] md:text-xs text-gray-500">
                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-blue-500 rounded-full"></div>&#x5718;&#x8ab2;</div>
                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-green-500 rounded-full"></div>&#x5c08;&#x5c6c;&#x6559;&#x7df4;&#x8ab2;</div>
                </div>
              </div>

              <div className="booking-slots p-4 md:p-0 w-full md:w-2/3">
                <h3 className="font-bold text-gray-800 mb-4 ml-1 text-sm md:text-lg border-b-2 border-emerald-500 w-fit pb-1">&#x53ef;&#x9810;&#x7d04;&#x6642;&#x6bb5;</h3>
                {dailySlots.length === 0 ? (
                    <div className="text-center text-gray-400 py-12 bg-white rounded-xl border border-dashed text-sm md:text-base">&#x672c;&#x65e5;&#x7121;&#x6392;&#x5b9a;&#x8ab2;&#x7a0b;</div>
                ) : (
                    <div className="space-y-4">
                        {dailySlots.map(slot => {
                          const isCoachSlot = slot.title.startsWith('[\u5c08\u5c6c\u6559\u7df4\u8ab2]');
                          const isFull = isCoachSlot ? studentCount > 2 || Number(slot.remaining) < 1 : Number(slot.remaining) < studentCount;

                          const safeLocation = slot.location || '';
                          const availableLocs = slot.availableLocations || [];
                          let slotDisplayLocation = safeLocation;

                          if (safeLocation.startsWith('coach_loc:')) {
                              slotDisplayLocation = '\u5b78\u54e1\u81ea\u9078\u5834\u5730';
                          } else if (isCoachSlot) {
                              slotDisplayLocation = '\u5b78\u54e1\u81ea\u9078\u5834\u5730'; 
                          }

                          if (isCoachSlot) {
                              const my1v1 = slot.priceQuote?.coachPlans?.['1\u5c0d1'];
                              const my1v2 = slot.priceQuote?.coachPlans?.['1\u5c0d2'];
                              const selectedLoc = studentLocations[slot.id] || availableLocs[0] || '\u95dc\u8056\u91cc\u6d3b\u52d5\u4e2d\u5fc3';

                              return (
                                <div key={slot.id} className={`border p-5 rounded-2xl flex flex-col shadow-sm transition relative overflow-hidden ${isFull ? 'bg-gray-50 border-l-4 border-l-gray-400 opacity-80' : 'bg-green-50 border-l-4 border-l-green-500'}`}>
                                    <div className={`absolute top-0 right-0 text-xs px-3 py-1.5 rounded-bl-lg font-bold tracking-wide ${isFull ? 'bg-gray-200 text-gray-600' : 'bg-green-200 text-green-800'}`}>&#x5c08;&#x5c6c;&#x6559;&#x7df4;&#x8ab2;&#x958b;&#x653e;&#x6642;&#x6bb5;</div>
                                    <div className={`font-bold text-lg md:text-xl mt-1 ${isFull ? 'text-gray-500' : 'text-green-800'}`}>&#x5c08;&#x5c6c;&#x6559;&#x7df4;&#x8ab2;</div>
                                    <p className="text-xs text-green-900 mt-1">&#x6bcf;&#x5c0f;&#x6642;&#x6559;&#x7df4;&#x8cbb;&#xff0c;&#x73fe;&#x5834;&#x73fe;&#x91d1;&#x4ed8;&#x6b3e;&#xff1b;&#x4e0d;&#x542b;&#x5834;&#x5730;&#x8cbb;&#xff0c;&#x5834;&#x5730;&#x7531;&#x5b78;&#x54e1;&#x81ea;&#x884c;&#x9810;&#x7d04;&#x3002;</p>
                                    <div className="font-semibold text-gray-800 mt-2 text-sm md:text-base">{slot.date}</div>
                                    <div className="text-sm text-gray-500 mt-1">{slot.time} &#x2022; {slotDisplayLocation}</div>
                                    <p className="text-sm text-gray-600 mt-1 break-words">&#x6388;&#x8ab2;&#x6559;&#x7df4;&#xff1a;{slot.teachingCoachName || '\u672a\u6307\u5b9a'}</p>
                                    
                                    {studentCount === 2 && !supportsSharedCoach && <p className="mt-3 text-sm text-amber-800">&#x96d9;&#x4eba;&#x5e33;&#x865f;&#x7684;&#x5c08;&#x5c6c;&#x6559;&#x7df4;&#x8ab2;&#x9810;&#x7d04;&#x5c1a;&#x672a;&#x555f;&#x7528;&#xff0c;&#x8acb;&#x806f;&#x7d61;&#x6559;&#x7df4;&#x3002;</p>}
                                    {!isFull && (
                                      <div className="mt-4">
                                          <div className="text-xs md:text-sm text-red-600 bg-red-50 px-3 py-2 rounded border border-red-100 mb-3 font-medium">
                                            &#x26a0;&#xfe0f; &#x6b64;&#x8cbb;&#x7528;&#x50c5;&#x542b;&#x6559;&#x7df4;&#x6559;&#x5b78;&#xff0c;<strong>&#x4e0d;&#x542b;&#x5834;&#x5730;&#x8cbb;&#xff1b;&#x5834;&#x5730;&#x8acb;&#x5b78;&#x54e1;&#x81ea;&#x884c;&#x9810;&#x7d04;&#x4e26;&#x652f;&#x4ed8;&#x5834;&#x5730;&#x8cbb;</strong>&#x3002;&#x672c;&#x7cfb;&#x7d71;&#x4e0d;&#x4ee3;&#x8a02;&#x5834;&#x5730;&#x3002;
                                          </div>
                                          <label className="block text-sm font-bold text-green-900 mb-2">&#x4e0a;&#x8ab2;&#x5834;&#x5730;&#xff08;&#x8acb;&#x5b78;&#x54e1;&#x81ea;&#x884c;&#x9810;&#x7d04;&#xff09;</label>
                                          <select aria-label="&#x4e0a;&#x8ab2;&#x5834;&#x5730;&#xff08;&#x8acb;&#x5b78;&#x54e1;&#x81ea;&#x884c;&#x9810;&#x7d04;&#xff09;" className="w-full border border-green-200 p-2.5 rounded-lg bg-white text-base md:text-sm outline-none shadow-sm" value={selectedLoc} onChange={(e) => setStudentLocations(prev => ({...prev, [slot.id]: e.target.value}))}>
                                              {availableLocs.map(loc => (
                                                  <option key={loc} value={loc}>{loc === '\u81ea\u7406\u5834\u5730(\u9700\u79c1\u8a0a\u78ba\u8a8d)' ? '\u5176\u4ed6\u5834\u5730(\u8acb\u5148\u79c1\u8a0a\u6559\u7df4)' : loc}</option>
                                              ))}
                                          </select>
                                      </div>
                                    )}

                                    <div className={`coach-lesson-options mt-5 pt-4 border-t flex flex-col md:flex-row gap-3 ${isFull ? 'border-gray-200' : 'border-green-200'}`}>
                                        <div className={`flex-1 min-w-0 flex justify-between items-center p-3 rounded-lg border shadow-sm ${isFull ? 'bg-gray-100 border-gray-200' : 'bg-white border-green-100'}`}>
                                            <div className={isFull ? 'opacity-60' : ''}>
                                                <span className={`font-bold text-sm md:text-base ${isFull ? 'text-gray-500' : 'text-green-700'}`}>1&#x5c0d;1 &#x6559;&#x7df4;&#x8ab2;</span>
                                                <div className="mt-0.5"><span className={`${isFull ? 'text-gray-500' : 'text-emerald-600'} font-bold text-lg`}>&#x6bcf;&#x5e33;&#x865f; NT$ {my1v1}</span></div>
                                            </div>
                                            <button onClick={() => handleBookClick(slot, '1\u5c0d1', selectedLoc)} disabled={(status==='booking' || status==='quoting') || isFull || (studentCount === 2 && !supportsSharedCoach)} className={`font-bold py-2 px-5 rounded-lg text-sm md:text-base active:scale-95 transition-transform ${isFull ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}>{isFull ? '\u5df2\u984d\u6eff' : '\u9810\u7d04 1\u5c0d1'}</button>
                                        </div>
                                        <div className={`flex-1 min-w-0 flex justify-between items-center p-3 rounded-lg border shadow-sm ${isFull ? 'bg-gray-100 border-gray-200' : 'bg-white border-green-100'}`}>
                                            <div className={isFull ? 'opacity-60' : ''}>
                                                <span className={`font-bold text-sm md:text-base ${isFull ? 'text-gray-500' : 'text-green-700'}`}>1&#x5c0d;2 &#x6559;&#x7df4;&#x8ab2;</span>
                                                <div className="mt-0.5"><span className={`${isFull ? 'text-gray-500' : 'text-emerald-600'} font-bold text-lg`}>&#x6bcf;&#x5e33;&#x865f; NT$ {my1v2}</span></div>
                                            </div>
                                            <button onClick={() => handleBookClick(slot, '1\u5c0d2', selectedLoc)} disabled={(status==='booking' || status==='quoting') || isFull || (studentCount === 2 && !supportsSharedCoach)} className={`font-bold py-2 px-5 rounded-lg text-sm md:text-base active:scale-95 transition-transform ${isFull ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}>{isFull ? '\u5df2\u984d\u6eff' : '\u9810\u7d04 1\u5c0d2'}</button>
                                        </div>
                                    </div>
                                </div>
                              );
                          }

                          const originalPrice = slot.priceQuote?.regularTotalPrice;
                          const myPrice = slot.priceQuote?.totalPrice;
                          const isDiscounted = Number(myPrice) < Number(originalPrice);

                          return (
                            <div key={slot.id} className={`border p-5 rounded-2xl flex flex-col shadow-sm transition relative overflow-hidden ${isFull ? 'bg-gray-50 border-l-4 border-l-gray-400 opacity-80' : 'bg-white border-l-4 border-l-blue-500 hover:shadow-md'}`}>
                              {slot.title.includes('[\u6708\u7e73') && <div className={`absolute top-0 right-0 text-xs px-3 py-1.5 rounded-bl-lg font-bold ${isFull ? 'bg-gray-200 text-gray-600' : 'bg-amber-100 text-amber-800'}`}>&#x5957;&#x88dd;&#x8ab2;&#x7a0b;</div>}
                              <div className="flex flex-col sm:flex-row gap-3 justify-between items-start mt-1">
                                <div className={`w-full sm:w-3/4 min-w-0 sm:pr-2 ${isFull ? 'opacity-60' : ''}`}>
                                  <div className={`font-bold text-lg md:text-xl leading-tight ${isFull ? 'text-gray-500' : 'text-blue-700'}`}>{slot.title}</div>
                                  <div className="font-semibold text-gray-800 mt-2 text-sm md:text-base">{slot.date}</div>
                                  <div className="text-sm text-gray-500 mt-1">{slot.time} &#x2022; {safeLocation}</div>
                                  <p className="text-sm text-gray-600 mt-1 break-words">&#x6388;&#x8ab2;&#x6559;&#x7df4;&#xff1a;{slot.teachingCoachName || '\u672a\u6307\u5b9a'}</p>
                                </div>
                                <button onClick={() => handleBookClick(slot)} disabled={(status==='booking' || status==='quoting') || isFull} className={`font-bold py-2.5 px-6 rounded-lg shadow-sm text-sm md:text-base active:scale-95 transition-transform whitespace-nowrap ${isFull ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>{isFull ? '\u5df2\u984d\u6eff' : '\u9810\u7d04'}</button>
                              </div>
                              <div className={`mt-4 pt-4 border-t flex items-center justify-between w-full ${isFull ? 'border-gray-200 opacity-60' : 'border-gray-100'}`}>
                                <div className="flex flex-wrap items-baseline gap-2">
                                  {isDiscounted && <del className="text-gray-500 text-xs">&#x539f;&#x50f9; NT$ {originalPrice}</del>}
                                  <span className={`${isFull ? 'text-gray-500' : 'text-emerald-600'} font-bold text-xl`}>NT$ {myPrice}&#xff08;{studentCount} &#x4eba;&#x5408;&#x8a08;&#xff09;</span>
                                  {isDiscounted && <span className="bg-red-50 text-red-600 border border-red-200 text-[10px] md:text-xs px-2 py-0.5 rounded font-bold">&#x7279;&#x50f9;</span>}
                                </div>
                                <span className={`shrink-0 whitespace-nowrap text-xs md:text-sm font-medium px-3 py-1 rounded-full ${isFull ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>{isFull ? '\u5df2\u6eff\u73ed' : `\u5269 ${slot.remaining} \u540d`}</span>
                              </div>
                              <GroupQuotePrices quote={slot.priceQuote} />
                            </div>
                          );
                        })}
                    </div>
                )}
              </div>

              {/* \u9810\u7d04\u7d50\u5e33\u5f48\u7a97 */}
              {bookingTarget && !agreementAccepted && <BookingAgreement target={bookingTarget} onCancel={() => setBookingTarget(null)} onContinue={() => setAgreementAccepted(true)} />}
              {bookingTarget && agreementAccepted && (
                <div className="fixed inset-0 bg-slate-900 bg-opacity-60 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-4 overflow-y-auto">
                    <div className="booking-confirmation bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[90dvh] overflow-y-auto my-auto animate-[pulse_0.2s_ease-out_1]">
                        <div className="bg-slate-800 p-4 text-white">
                            <h3 className="font-bold text-lg">&#x78ba;&#x8a8d;&#x9810;&#x7d04;&#x8cc7;&#x8a0a;</h3>
                        </div>
                        <div className="p-6 space-y-5">
                            <div>
                                <div className="text-sm text-gray-500 mb-1">&#x9810;&#x7d04;&#x9805;&#x76ee;</div>
                                <div className="font-bold text-lg text-slate-800 leading-tight">{bookingTarget.titleDisplay}</div>
                                <div className="text-sm text-emerald-600 font-bold mt-1.5">{bookingTarget.slot.date} {bookingTarget.slot.time}</div>
                            </div>
                            <div>
                                <div className="text-sm text-gray-500 mb-1">&#x61c9;&#x7e73;&#x91d1;&#x984d;</div>
                                <div className="font-black text-2xl text-emerald-600">NT$ {bookingTarget.myPrice}&#xff08;&#x5171; {studentCount} &#x4eba;&#xff09;</div>
                            </div>
                            
                            <GroupQuotePrices quote={bookingTarget.quote} />
                            {bookingTarget.slot.title.startsWith('[\u5c08\u5c6c\u6559\u7df4\u8ab2]') && <p className="text-sm text-red-800 bg-red-50 border border-red-200 p-3 rounded-lg">&#x6b64;&#x91d1;&#x984d;&#x70ba;&#x6559;&#x7df4;&#x8cbb;&#xff0c;&#x4e0d;&#x542b;&#x5834;&#x5730;&#x8cbb;&#x3002;&#x5b78;&#x54e1;&#x9808;&#x81ea;&#x884c;&#x9810;&#x7d04;&#x4e0a;&#x8ab2;&#x5834;&#x5730;&#x4e26;&#x652f;&#x4ed8;&#x5834;&#x5730;&#x8cbb;&#xff0c;&#x672c;&#x7cfb;&#x7d71;&#x4e0d;&#x4ee3;&#x8a02;&#x5834;&#x5730;&#x3002;</p>}
                            {bookingTarget.slot.title.startsWith('[\u5c08\u5c6c\u6559\u7df4\u8ab2]') ? <div className="bg-amber-50 border border-amber-200 rounded-lg p-4"><h4 className="font-bold text-amber-950">&#x4ed8;&#x6b3e;&#x65b9;&#x5f0f;&#xff1a;&#x73fe;&#x5834;&#x73fe;&#x91d1;&#x4ed8;&#x6b3e;</h4><p className="text-sm text-amber-900 mt-2">&#x8acb;&#x65bc;&#x4e0a;&#x8ab2;&#x7576;&#x5929;&#x73fe;&#x5834;&#x652f;&#x4ed8;&#x6559;&#x7df4;&#x8cbb;&#xff0c;&#x4e0d;&#x9700;&#x4e8b;&#x5148;&#x532f;&#x6b3e;&#x6216;&#x586b;&#x5beb;&#x532f;&#x6b3e;&#x5f8c;&#x4e94;&#x78bc;&#x3002;&#x9810;&#x7d04;&#x4ecd;&#x9700;&#x6559;&#x7df4;&#x78ba;&#x8a8d;&#x3002;</p></div> : <>
                            <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                                <div className="text-xs font-bold text-emerald-700 mb-1">&#x8acb;&#x532f;&#x6b3e;&#x81f3;&#x4ee5;&#x4e0b;&#x6307;&#x5b9a;&#x5e33;&#x6236;&#xff1a;</div>
                                <div className="text-sm text-slate-700">&#x9280;&#x884c;&#x4ee3;&#x865f;&#xff1a;<span className="font-bold text-slate-900">391</span></div>
                                <div className="text-sm text-slate-700 mt-0.5">&#x532f;&#x6b3e;&#x5e33;&#x865f;&#xff1a;<span className="font-bold text-slate-900 font-mono tracking-wider">0000001528897673</span></div>
                            </div>

                            <div className="border-t pt-5">
                                <label className="block text-sm font-bold text-slate-700 mb-2">&#x532f;&#x6b3e;&#x5e33;&#x865f;&#x5f8c;5&#x78bc; (&#x9078;&#x586b;)</label>
                                <input 
                                    type="text" 
                                    maxLength="5" 
                                    placeholder="&#x4f8b;&#x5982;: 12345"
                                    className="w-full border border-gray-300 p-3 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none font-mono text-lg"
                                    value={paymentCode}
                                    onChange={e => setPaymentCode(e.target.value.replace(/\D/g, ''))}
                                />
                                <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded mt-3 leading-relaxed">
                                    &#x1f4a1; &#x82e5;&#x5c1a;&#x672a;&#x532f;&#x6b3e;&#xff0c;&#x60a8;&#x53ef;&#x5148;&#x6309;&#x78ba;&#x8a8d;&#xff0c;&#x7a0d;&#x5f8c;&#x518d;&#x81f3;&#x7d00;&#x9304;&#x4e2d;&#x88dc;&#x767b;&#x5f8c;&#x4e94;&#x78bc;&#x3002;
                                </p>
                            </div>
                            </>}
                        </div>
                        <div className="flex border-t border-gray-100">
                            <button onClick={() => setBookingTarget(null)} className="flex-1 min-w-0 py-4 font-bold text-gray-500 hover:bg-gray-50 border-r border-gray-100 transition">&#x53d6;&#x6d88;</button>
                            <button onClick={confirmBooking} disabled={status === 'booking'} className="flex-1 min-w-0 py-4 font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition active:scale-95 disabled:opacity-50">
                                {status === 'booking' ? '\u8655\u7406\u4e2d...' : '\u78ba\u5b9a\u9001\u51fa'}
                            </button>
                        </div>
                    </div>
                </div>
              )}
            </div></div>
          );
        };

        const MonthlyLeaveSummary = ({ records }) => !records.length ? null : (
            <section className="monthly-leave-summary bg-amber-50 border border-amber-200 rounded-2xl p-4 md:p-6 mb-6" aria-label="&#x8acb;&#x5047;&#x8207;&#x88dc;&#x8ab2;&#x7d00;&#x9304;">
                <h3 className="font-bold text-amber-950 mb-3">&#x6708;&#x7e73;&#x8acb;&#x5047;&#x8207;&#x88dc;&#x8ab2;</h3>
                <div className="space-y-3">
                    {records.map(record => <div key={record.id} className="bg-white rounded-xl border p-3 text-sm">
                        <p className="font-bold">{record.originalDate} {record.originalTime} &#x8acb;&#x5047; &#xb7; {record.status}</p>
                        <p className="text-gray-600">{record.monthlyTitle}</p>
                        {record.status === '\u5df2\u5b89\u6392' ? <p className="mt-1 text-emerald-800">&#x88dc;&#x8ab2;&#xff1a;{record.makeupDate} {record.makeupTime} &#xb7; {record.makeupTitle} &#xb7; {record.makeupLocation}</p> : <p className="mt-1 text-amber-800">&#x5f85;&#x6559;&#x7df4;&#x5b89;&#x6392;&#x88dc;&#x8ab2;&#x6642;&#x9593;</p>}
                    </div>)}
                </div>
            </section>
        );

        const MonthlyLeaveModal = ({ bookings, slots, onClose, onSuccess }) => {
            const [records, setRecords] = useState([]);
            const [ready, setReady] = useState(false);
            const [error, setError] = useState('');
            const [busy, setBusy] = useState(false);
            const busyRef = React.useRef(false);
            const [bookingId, setBookingId] = useState('');
            const [originalDate, setOriginalDate] = useState('');
            const [reason, setReason] = useState('');
            const [targets, setTargets] = useState({});
            const [message, setMessage] = useState('');
            const monthlyBookings = bookings.filter(b => b.bookingId && b.status === '\u9810\u7d04\u6210\u529f' && slots.some(s => s.id === b.slotId && /^\[\u6708\u7e73/.test(s.title)));
            const selectedSlot = slots.find(s => s.id === (bookings.find(b => b.bookingId === bookingId) || {}).slotId);
            const request = async (payload) => {
                const accessToken = typeof liff !== 'undefined' ? liff.getAccessToken() : null;
                if (!accessToken) throw new Error('\u8acb\u91cd\u65b0\u767b\u5165 LINE \u5f8c\u518d\u64cd\u4f5c\u3002');
                const result = await fetchAPI({ ...payload, accessToken });
                if (!result || result.status !== 'success') throw new Error((result && result.message) || '\u5f8c\u7aef\u5c1a\u672a\u652f\u63f4\u8acb\u5047\u88dc\u8ab2\uff0c\u8acb\u66f4\u65b0 Apps Script \u90e8\u7f72\u5f8c\u518d\u8a66\u3002');
                return result;
            };
            const reload = async () => {
                const result = await request({ action: 'getMonthlyLeaves' });
                if (!Array.isArray(result.leaves)) throw new Error('\u8b80\u53d6\u8acb\u5047\u7d00\u9304\u5931\u6557\u3002');
                setRecords(result.leaves);
                setReady(true);
            };
            useEffect(() => { let active = true;
                request({ action: 'getMonthlyLeaves' }).then(result => {
                    if (!Array.isArray(result.leaves)) throw new Error('\u8b80\u53d6\u8acb\u5047\u7d00\u9304\u5931\u6557\u3002');
                    if (active) { setRecords(result.leaves); setReady(true); }
                }).catch(err => { if (active) setError(err.message); });
                return () => { active = false; };
            }, []);
            const mutate = async (payload, success) => {
                if (busyRef.current) return;
                busyRef.current = true; setBusy(true); setError(''); setMessage('');
                let saved = false;
                try {
                    await request(payload); saved = true;
                    if (payload.action === 'registerMonthlyLeave') { setOriginalDate(''); setReason(''); }
                    await reload();
                    await onSuccess();
                    setMessage(success);
                } catch (err) {
                    if (saved) setReady(false);
                    setError(saved ? '\u8cc7\u6599\u5df2\u5132\u5b58\uff0c\u4f46\u91cd\u65b0\u8b80\u53d6\u5931\u6557\u3002\u8acb\u95dc\u9589\u5f8c\u91cd\u65b0\u958b\u555f\u6838\u5c0d\uff0c\u52ff\u91cd\u8907\u9001\u51fa\u3002' : err.message);
                } finally { busyRef.current = false; setBusy(false); }
            };
            const register = (event) => {
                event.preventDefault();
                mutate({ action: 'registerMonthlyLeave', bookingId, originalDate, reason }, '\u8acb\u5047\u5df2\u767b\u8a18\uff0c\u53ef\u5728\u4e0b\u65b9\u5b89\u6392\u88dc\u8ab2\u3002');
            };
            const singleStart = (slot) => {
                const date = String(slot.date || '').match(/^(\d{4}-\d{2}-\d{2})/);
                const time = String(slot.time || '').match(/^(\d{1,2}:\d{2})/);
                return date && time ? Date.parse(`${date[1]}T${time[1].padStart(5, '0')}:00+08:00`) : NaN;
            };
            return (
                <div className="fixed inset-0 z-50 bg-slate-900 bg-opacity-60 p-3 md:p-4 flex items-center justify-center overflow-y-auto">
                    <div role="dialog" aria-modal="true" aria-label="&#x6708;&#x7e73;&#x8acb;&#x5047;&#x8207;&#x88dc;&#x8ab2;" className="w-full min-w-0 max-w-4xl max-h-[90dvh] bg-gray-50 rounded-2xl shadow-xl flex flex-col overflow-hidden my-auto">
                        <div className="p-4 bg-slate-800 text-white flex gap-3 justify-between items-center shrink-0">
                            <h2 className="font-bold text-lg">&#x6708;&#x7e73;&#x8acb;&#x5047;&#x8207;&#x88dc;&#x8ab2;</h2>
                            <button onClick={onClose} disabled={busy} aria-label="&#x95dc;&#x9589;&#x8acb;&#x5047;&#x88dc;&#x8ab2;" className="px-3 text-2xl shrink-0 disabled:opacity-50">&#xd7;</button>
                        </div>
                        <div className="p-4 md:p-6 overflow-y-auto min-w-0">
                            <p className="text-sm text-slate-600 mb-4">&#x6bcf;&#x6b21;&#x8acb;&#x5047;&#x9700;&#x5728;&#x8a72;&#x5802;&#x8ab2;&#x958b;&#x59cb;&#x524d;&#x81f3;&#x5c11; 14 &#x5929;&#x767b;&#x8a18;&#xff08;&#x53f0;&#x5317;&#x6642;&#x9593;&#xff09;&#x3002;&#x4fdd;&#x7559;&#x539f;&#x6708;&#x7e73;&#x8a02;&#x55ae;&#xff0c;&#x88dc;&#x8ab2;&#x4e0d;&#x91cd;&#x8907;&#x6536;&#x8cbb;&#x3002;</p>
                            {error && <p role="alert" className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-lg mb-4">{error}</p>}
                            {message && <p role="status" className="bg-emerald-50 text-emerald-800 p-3 rounded-lg mb-4">{message}</p>}
                            {!ready && !error && <p role="status" className="mb-4 text-gray-500">&#x8b80;&#x53d6;&#x8acb;&#x5047;&#x7d00;&#x9304;&#x4e2d;...</p>}
                            <form onSubmit={register} className="bg-white border rounded-xl p-4 space-y-4 mb-6">
                                <h3 className="font-bold">&#x767b;&#x8a18;&#x6708;&#x7e73;&#x8acb;&#x5047;</h3>
                                <label className="block text-sm font-bold">&#x6708;&#x7e73;&#x5b78;&#x751f;&#x8207;&#x8a02;&#x55ae;
                                    <select aria-label="&#x6708;&#x7e73;&#x5b78;&#x751f;&#x8207;&#x8a02;&#x55ae;" required disabled={busy || !ready} value={bookingId} onChange={e => { setBookingId(e.target.value); setOriginalDate(''); }} className="block w-full min-w-0 border rounded-lg p-3 mt-2 bg-white">
                                        <option value="">&#x8acb;&#x9078;&#x64c7;&#x6708;&#x7e73;&#x5b78;&#x751f;</option>
                                        {monthlyBookings.map(b => <option key={b.bookingId} value={b.bookingId}>{b.name} &#xb7; {(slots.find(s => s.id === b.slotId) || {}).title} &#xb7; {(slots.find(s => s.id === b.slotId) || {}).date}</option>)}
                                    </select>
                                </label>
                                {!monthlyBookings.length && <p className="text-sm text-gray-500">&#x76ee;&#x524d;&#x6c92;&#x6709;&#x5df2;&#x78ba;&#x8a8d;&#x7684;&#x6708;&#x7e73;&#x9810;&#x7d04;&#x3002;</p>}
                                {selectedSlot && <p className="text-sm bg-amber-50 p-3 rounded-lg">&#x539f;&#x8ab2;&#x7a0b;&#xff1a;{selectedSlot.date} &#xb7; {selectedSlot.time}&#x3002;&#x8acb;&#x78ba;&#x8a8d;&#x4e0b;&#x65b9;&#x8acb;&#x5047;&#x65e5;&#x671f;&#x7684;&#x5e74;&#x4efd;&#x6b63;&#x78ba;&#x3002;</p>}
                                <label className="block text-sm font-bold">&#x8acb;&#x5047;&#x4e0a;&#x8ab2;&#x65e5;&#x671f;
                                    <input aria-label="&#x8acb;&#x5047;&#x4e0a;&#x8ab2;&#x65e5;&#x671f;" type="date" required disabled={busy || !ready} value={originalDate} onChange={e => setOriginalDate(e.target.value)} className="block w-full min-w-0 border p-3 rounded-lg mt-2" />
                                </label>
                                <label className="block text-sm font-bold">&#x8acb;&#x5047;&#x539f;&#x56e0;
                                    <textarea aria-label="&#x8acb;&#x5047;&#x539f;&#x56e0;" required maxLength={500} disabled={busy || !ready} value={reason} onChange={e => setReason(e.target.value)} className="block w-full border p-3 rounded-lg mt-2" rows="2" />
                                </label>
                                <button type="submit" disabled={busy || !ready || !bookingId} className="w-full bg-amber-600 text-white rounded-lg px-4 py-3 font-bold disabled:opacity-50">{busy ? '\u8655\u7406\u4e2d...' : '\u767b\u8a18\u8acb\u5047'}</button>
                            </form>
                            <h3 className="font-bold mb-3">&#x8acb;&#x5047;&#x8207;&#x88dc;&#x8ab2;&#x7d00;&#x9304;</h3>
                            {ready && !records.length && <p className="text-gray-500 text-sm">&#x76ee;&#x524d;&#x6c92;&#x6709;&#x8acb;&#x5047;&#x7d00;&#x9304;&#x3002;</p>}
                            <div className="space-y-4">
                                {records.slice().reverse().map(record => {
                                    const available = slots.filter(s => !/^\[(\u6708\u7e73|\u5c08\u5c6c\u6559\u7df4\u8ab2)/.test(s.title) && Number(s.remaining) > 0 && singleStart(s) > Date.now() && !String(s.date).startsWith(record.originalDate));
                                    return <article key={record.id} className="bg-white border rounded-xl p-4 min-w-0">
                                        <div className="flex flex-wrap gap-2 justify-between"><h4 className="font-bold">{record.name}</h4><span className="text-sm text-amber-800">{record.status}</span></div>
                                        <p className="text-sm text-gray-700 mt-2">&#x8acb;&#x5047;&#xff1a;{record.originalDate} {record.originalTime} &#xb7; {record.monthlyTitle}</p>
                                        <p className="text-sm text-gray-500 mt-1 whitespace-pre-wrap">&#x539f;&#x56e0;&#xff1a;{record.reason}</p>
                                        {record.status === '\u5f85\u88dc\u8ab2' ? <div className="mt-3 space-y-3">
                                            <select aria-label={`\u5b89\u6392${record.name} ${record.originalDate}\u88dc\u8ab2\u6642\u6bb5`} disabled={busy || !ready} value={targets[record.id] || ''} onChange={e => setTargets(prev => ({ ...prev, [record.id]: e.target.value }))} className="w-full min-w-0 border rounded-lg p-3 bg-white">
                                                <option value="">&#x8acb;&#x9078;&#x64c7;&#x6709;&#x540d;&#x984d;&#x7684;&#x55ae;&#x5802;&#x5718;&#x8ab2;</option>
                                                {available.map(s => <option key={s.id} value={s.id}>{s.date} {s.time} &#xb7; {s.title} &#xb7; {s.location}&#xff08;&#x5269; {s.remaining} &#x540d;&#xff09;</option>)}
                                            </select>
                                            {!available.length && <p className="text-sm text-gray-500">&#x6c92;&#x6709;&#x53ef;&#x7528;&#x6642;&#x6bb5;&#xff0c;&#x8acb;&#x5148;&#x5728;&#x5f8c;&#x53f0;&#x65b0;&#x589e;&#x55ae;&#x5802;&#x5718;&#x8ab2;&#x3002;</p>}
                                            <button type="button" disabled={busy || !ready || !available.some(s => s.id === targets[record.id])} onClick={() => {
                                                const target = available.find(s => s.id === targets[record.id]);
                                                if (target && confirm(`\u78ba\u8a8d\u70ba ${record.name} \u5b89\u6392\u88dc\u8ab2\uff1f\n${target.date} ${target.time}\n${target.title} \u00b7 ${target.location}\n\u5c07\u5360\u7528\u4e00\u500b\u540d\u984d\uff0c\u4e0d\u91cd\u8907\u6536\u8cbb\u3002`)) mutate({ action: 'arrangeMonthlyMakeup', leaveId: record.id, slotId: target.id }, '\u88dc\u8ab2\u5df2\u5b89\u6392\uff0c\u5b78\u751f\u9810\u7d04\u7d00\u9304\u5df2\u66f4\u65b0\u3002');
                                            }} className="w-full bg-emerald-600 text-white rounded-lg px-4 py-3 font-bold disabled:opacity-50">&#x5b89;&#x6392;&#x88dc;&#x8ab2;</button>
                                        </div> : <p className="mt-3 text-sm text-emerald-800">&#x88dc;&#x8ab2;&#xff1a;{record.makeupDate} {record.makeupTime} &#xb7; {record.makeupTitle} &#xb7; {record.makeupLocation}</p>}
                                    </article>;
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            );
        };

        const StudentRecordsView = ({ lineId, userRecord, initialStudentId }) => {
            const [studentId, setStudentId] = useState(initialStudentId !== undefined ? initialStudentId : (userRecord?.students?.[0]?.id || ''));
            const [data, setData] = useState(null);
            const recordsRequest = React.useRef(0);

            const fetchRecords = () => {
                if(lineId) {
                    const requestId = ++recordsRequest.current;
                    fetchAPI({ action: 'getStudentStats', lineId, studentId }).then(res => { if (requestId !== recordsRequest.current) return; if (res.status === 'success') setData(res); else { setData(null); alert(res.message || '\u7d00\u9304\u8b80\u53d6\u5931\u6557'); } });
                }
            };

            useEffect(() => { 
                fetchRecords(); 
            }, [lineId, studentId]);

            if (!data) return <div className="p-10 text-center text-gray-400 font-bold animate-pulse">&#x8b80;&#x53d6;&#x8cc7;&#x6599;&#x4e2d;...</div>;

            return (
                <div className="records-view p-4 md:p-8 pb-10">
                    {userRecord?.students?.length > 1 && <label className="block font-bold mb-6">&#x67e5;&#x770b;&#x5b78;&#x751f;&#x8a13;&#x7df4;&#x7d00;&#x9304;<select aria-label="&#x67e5;&#x770b;&#x5b78;&#x751f;&#x8a13;&#x7df4;&#x7d00;&#x9304;" className="block w-full border p-3 rounded-lg mt-2" value={studentId} onChange={e => { recordsRequest.current++; setData(null); setStudentId(e.target.value); }}>{userRecord.students.map((student, index) => <option key={student.id} value={student.id}>{studentNickname(student, index)}</option>)}</select></label>}
                    <MonthlyLeaveSummary records={data.monthlyLeaves || []} />
                    <div className="records-total bg-white rounded-2xl shadow-sm border p-6 md:p-8 text-center border-t-4 border-t-emerald-500 mb-6">
                        <div className="text-sm md:text-base text-gray-500 font-bold mb-2">&#x7d2f;&#x7a4d;&#x5b8c;&#x6210;&#x8ab2;&#x7a0b; (&#x5df2;&#x5b8c;&#x8ab2;)</div>
                        <div className="text-5xl md:text-6xl font-extrabold text-slate-800">{data.totalClasses || 0} <span className="text-lg text-gray-500 font-normal">&#x5802;</span></div>
                    </div>

                    <div className="records-detail-grid grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white rounded-2xl shadow-sm border p-5 md:p-6 h-fit">
                            <h3 className="font-bold text-slate-800 mb-4 ml-1 flex items-center text-base md:text-lg">
                                <span className="w-1.5 h-5 bg-emerald-500 rounded mr-2"></span>&#x80fd;&#x529b;&#x6642;&#x6578;&#x96f7;&#x9054;
                            </h3>
                            <p className="text-xs text-slate-500 mb-3">&#x8a13;&#x7df4;&#x6b21;&#x6578;&#x4f9d;&#x6bcf; 5 &#x5206;&#x9418;&#x7d04; 40 &#x6b21;&#x4f30;&#x7b97;&#x3002;</p>
                            <div data-layout="skill-radar" className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {SKILL_KEYS.map(skill => (
                                    <CircleProgress key={skill.key} label={skill.label} value={data.stats ? data.stats[skill.key] : 0} />
                                ))}
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl shadow-sm border p-5 md:p-6">
                            <h3 className="font-bold text-slate-800 mb-4 ml-1 flex items-center text-base md:text-lg">
                                <span className="w-1.5 h-5 bg-blue-500 rounded mr-2"></span>&#x8fd1;&#x671f;&#x8a13;&#x7df4;&#x65e5;&#x8a8c;
                            </h3>
                            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                                {!data.logs || data.logs.length === 0 ? (
                                    <div className="text-center text-gray-400 text-sm py-6">&#x6559;&#x7df4;&#x5c1a;&#x672a;&#x586b;&#x5beb;&#x60a8;&#x7684;&#x65e5;&#x8a8c;</div>
                                ) : (
                                    data.logs.map((log, i) => (
                                        <div key={i} className="border-b border-dashed border-gray-200 pb-4 last:border-0 last:pb-0">
                                            <div className="text-sm font-bold text-emerald-600 mb-1.5">{formatTrainingDate(log.date)}</div>
                                            <p className="text-sm md:text-base text-gray-700 whitespace-pre-wrap leading-relaxed">{log.note || '\u672c\u6b21\u7121\u7279\u5225\u5099\u8a3b'}</p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            );
        };

        const VenueAddresses = () => (
            <section aria-labelledby="venue-addresses-title" className="m-4 md:mx-8 mb-8 bg-white rounded-2xl shadow-sm border p-5 md:p-6">
                <h3 id="venue-addresses-title" className="font-bold text-slate-800 text-base md:text-lg mb-4">&#x5834;&#x5730;&#x5730;&#x5740;</h3>
                <dl data-i18n-ignore="true" className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                        ['\u95dc\u8056\u91cc\u6d3b\u52d5\u4e2d\u5fc3', '701\u81fa\u5357\u5e02\u6771\u5340\u95dc\u8056\u91cc\u88d5\u5b5d\u8def118\u865f'],
                        ['\u4e2d\u611b\u7fbd\u7403\u9928', '\u81fa\u5357\u5e02\u6771\u5340\u88d5\u8c50\u8857214\u5df7'],
                        ['\u4ec1\u5fb7\u7fbd\u6f6e', '\u53f0\u5357\u5e02\u4ec1\u5fb7\u5340\u52dd\u5229\u8def380\u865f'],
                        ['\u83ef\u4e2d\u7fbd\u7403\u9928', '\u81fa\u5357\u5e02\u4ec1\u5fb7\u5340\u4ec1\u5fb7\u91cc\u6587\u5584\u8857116\u865f'],
                        ['\u6c38\u5eb7\u5609\u4e16', '\u81fa\u5357\u5e02\u6c38\u5eb7\u5340\u5efa\u570b\u91cc\u9ad8\u901f\u4e00\u8857\u4e8c\u6bb5378\u5df72\u865f'],
                        ['\u6c38\u5eb7\u9a30\u8000', '\u81fa\u5357\u5e02\u6c38\u5eb7\u5340\u5927\u7063\u8def942\u5df7371\u5f04178\u865f\u4e4b8'],
                        ['\u5357\u5340\u7fbd\u6f6e', '\u81fa\u5357\u5e02\u5357\u5340\u559c\u6771\u91cc\u842c\u5e74\u8def658\u865f']
                    ].map(([name, address]) => <div key={name} className="rounded-xl border border-slate-100 bg-slate-50 p-4 min-w-0">
                        <dt className="font-bold text-slate-800 mb-1">{name}</dt>
                        <dd><address className="not-italic text-sm md:text-base text-slate-600 leading-relaxed break-words">{address}</address></dd>
                    </div>)}
                </dl>
            </section>
        );

        const STUDENT_ROUTES = { booking: '#/booking', records: '#/training-logs' };
        const studentTabFromHash = hash => hash === STUDENT_ROUTES.records ? 'records' : 'booking';
        const rememberStudentRoute = () => {
            try {
                if (Object.values(STUDENT_ROUTES).includes(window.location.hash)) sessionStorage.setItem('badminton.studentRoute', window.location.hash);
            } catch (_) {}
        };
        const restoreStudentRoute = () => {
            try {
                const pending = sessionStorage.getItem('badminton.studentRoute');
                if (!Object.values(STUDENT_ROUTES).includes(window.location.hash) && Object.values(STUDENT_ROUTES).includes(pending)) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search + pending);
                sessionStorage.removeItem('badminton.studentRoute');
            } catch (_) {}
        };

        const StudentDashboard = ({ profile, userRecord, onCompleteRegistration, initialStudentId, coachView = false }) => {
            const [activeTab, setActiveTab] = useState(() => studentTabFromHash(window.location.hash));
            useEffect(() => {
                const syncRoute = () => setActiveTab(studentTabFromHash(window.location.hash));
                if (!Object.values(STUDENT_ROUTES).includes(window.location.hash)) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search + STUDENT_ROUTES.booking);
                syncRoute();
                window.addEventListener('hashchange', syncRoute);
                return () => window.removeEventListener('hashchange', syncRoute);
            }, []);
            const [bookingRevision, setBookingRevision] = useState(0);
            const currentStudentIndex = Math.max(0, userRecord.students.findIndex(student => student.id === initialStudentId));
            const currentStudent = userRecord.students[currentStudentIndex];
            const userLevel = userRecord ? (userRecord.level || 1) : 1;

            return (
                <div className="student-shell max-w-md md:max-w-5xl mx-auto bg-gray-50 min-h-screen md:min-h-[85vh] md:my-8 flex flex-col shadow-lg md:rounded-2xl overflow-hidden relative">
                    <header className="dashboard-header bg-amber-50 text-slate-900 shadow-md relative z-10">
                        <BrandBanner />
                        <div className="dashboard-heading px-5 md:px-8 pt-4">
                            <p className="text-sm md:text-base text-slate-700">{studentNickname(currentStudent, currentStudentIndex)}&#xff0c;&#x6b61;&#x8fce;&#xff01;</p>
                            <div className="language-switch-row mt-2 mb-4">
                                <div className="inline-block bg-amber-500 text-slate-900 text-xs md:text-sm font-bold px-2.5 py-1 rounded shadow-sm">{LEVEL_NAMES[userLevel]} &#x6703;&#x54e1;</div>
                                <LanguageSwitch />
                            </div>
                            <h2 className="py-3 text-lg font-bold border-t border-amber-200">{activeTab === 'booking' ? '\u8ab2\u7a0b\u9810\u7d04' : '\u6211\u7684\u8a13\u7df4\u65e5\u8a8c'}</h2>
                            {coachView && <nav aria-label="&#x5b78;&#x54e1;&#x756b;&#x9762;&#x5207;&#x63db;" className="flex gap-2 border-t border-amber-200 pt-3 pb-4">
                                <a href={STUDENT_ROUTES.booking} aria-current={activeTab === 'booking' ? 'page' : undefined} className={`flex-1 min-w-0 min-h-[44px] inline-flex items-center justify-center text-center px-3 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'booking' ? 'bg-emerald-700 text-white' : 'bg-white border border-amber-200 text-slate-700 hover:bg-amber-100'}`}>&#x8ab2;&#x7a0b;&#x9810;&#x7d04;</a>
                                <a href={STUDENT_ROUTES.records} aria-current={activeTab === 'records' ? 'page' : undefined} className={`flex-1 min-w-0 min-h-[44px] inline-flex items-center justify-center text-center px-3 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'records' ? 'bg-emerald-700 text-white' : 'bg-white border border-amber-200 text-slate-700 hover:bg-amber-100'}`}>&#x6211;&#x7684;&#x8a13;&#x7df4;&#x65e5;&#x8a8c;</a>
                            </nav>}
                        </div>
                    </header>

                    <div className="student-content flex-1 min-w-0 overflow-y-auto">
                        {userRecord.registrationComplete === false && <div className="m-4 p-4 border rounded-xl bg-amber-50"><p>&#x76ee;&#x524d;&#x5e33;&#x865f;&#x53ea;&#x6709;&#x820a;&#x7248;&#x55ae;&#x4eba;&#x8cc7;&#x6599;&#xff1b;&#x82e5;&#x5148;&#x524d;&#x9078;&#x64c7;&#x591a;&#x4eba;&#x4f46;&#x672a;&#x5132;&#x5b58;&#xff0c;&#x8acb;&#x88dc;&#x767b;&#x5168;&#x90e8;&#x5b78;&#x751f;&#x8cc7;&#x6599;&#x3002;</p>{onCompleteRegistration ? <button onClick={onCompleteRegistration} className="mt-3 bg-amber-700 text-white p-3 rounded-lg font-bold">&#x88dc;&#x767b;&#x540c;&#x5e33;&#x865f;&#x5b78;&#x751f;&#x8cc7;&#x6599;</button> : <p className="mt-2 text-sm">&#x8acb;&#x7531;&#x5b78;&#x54e1;&#x767b;&#x5165;&#x81ea;&#x5df1;&#x7684;&#x5e33;&#x865f;&#x88dc;&#x767b;&#x8cc7;&#x6599;&#x3002;</p>}</div>}
                        {activeTab === 'booking' ? <><StudentBookingView profile={profile} userRecord={userRecord} onBooked={() => setBookingRevision(value => value + 1)} /><StudentBookingTracking lineId={profile ? profile.userId : ''} students={userRecord.students} revision={bookingRevision} /><VenueAddresses /></> : <StudentRecordsView lineId={profile ? profile.userId : ''} userRecord={userRecord} initialStudentId={initialStudentId} />}
                    </div>
                </div>
            )
        };

        // ==========================================
        // \ud83d\udd39 \u6559\u7df4\u7aef\u4e3b\u9801\u9762\u8207\u5b50\u8996\u5716
        // ==========================================

        const TeachingCoachSelect = ({ coaches, value, onChange, disabled = false, allowUnassigned = false, label = '\u6388\u8ab2\u6559\u7df4' }) => (
            <label className="block text-sm font-bold text-gray-700">{label}
                <select aria-label={label} required={!allowUnassigned} disabled={disabled} value={value} onChange={event => onChange(event.target.value)} className="block w-full min-w-0 border border-gray-300 rounded-lg p-3 mt-1.5 bg-white font-normal text-base disabled:bg-gray-100">
                    <option value="" disabled={!allowUnassigned}>{allowUnassigned ? '\u672a\u6307\u5b9a\uff08\u820a\u8ab2\u7a0b\uff09' : '\u8acb\u9078\u64c7\u6388\u8ab2\u6559\u7df4'}</option>
                    {value && !coaches.some(coach => coach.id === value) && <option value={value} disabled>&#x539f;&#x6559;&#x7df4;&#x8cc7;&#x6599;&#x5f85;&#x6838;&#x5c0d;&#xff0c;&#x8acb;&#x91cd;&#x65b0;&#x9078;&#x64c7;</option>}
                    {coaches.map(coach => <option key={coach.id} value={coach.id}>{coach.name}</option>)}
                </select>
            </label>
        );

        const TeachingCoachesManager = ({ coaches, enabled, onSuccess }) => {
            const [editingId, setEditingId] = useState('');
            const [name, setName] = useState('');
            const [busy, setBusy] = useState(false);
            const [error, setError] = useState('');
            const [message, setMessage] = useState('');
            const busyRef = React.useRef(false);
            const save = async event => {
                event.preventDefault();
                if (!enabled || busyRef.current || !name.trim()) return;
                busyRef.current = true; setBusy(true); setError(''); setMessage('');
                let saved = false;
                try {
                    const accessToken = typeof liff !== 'undefined' ? liff.getAccessToken() : null;
                    if (!accessToken) throw new Error('\u8acb\u91cd\u65b0\u767b\u5165 LINE\u3002');
                    const result = await fetchAPI({ action: editingId ? 'updateTeachingCoach' : 'addTeachingCoach', teachingCoachId: editingId, name: name.trim(), accessToken });
                    if (!result || result.status !== 'success' || !result.coach?.id) throw new Error(result?.message || '\u5132\u5b58\u6559\u7df4\u8cc7\u6599\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002');
                    saved = true;
                    await onSuccess();
                    setName(''); setEditingId(''); setMessage('\u6388\u8ab2\u6559\u7df4\u8cc7\u6599\u5df2\u5132\u5b58\u3002');
                } catch (err) { setError(saved ? '\u6559\u7df4\u8cc7\u6599\u5df2\u5132\u5b58\uff0c\u4f46\u91cd\u65b0\u8b80\u53d6\u5931\u6557\uff0c\u8acb\u91cd\u65b0\u6574\u7406\u5f8c\u78ba\u8a8d\u3002' : err.message); }
                finally { busyRef.current = false; setBusy(false); }
            };
            return <section aria-labelledby="teaching-coaches-title" className="bg-white rounded-2xl shadow-sm border p-4 md:p-6 min-w-0">
                <h2 id="teaching-coaches-title" className="font-bold text-lg text-slate-800">&#x6388;&#x8ab2;&#x6559;&#x7df4;&#x7ba1;&#x7406;</h2>
                <p className="text-sm text-slate-500 mt-2">&#x65b0;&#x589e;&#x6559;&#x7df4;&#x59d3;&#x540d;&#x4f9b;&#x6392;&#x8ab2;&#x9078;&#x64c7;&#xff0c;&#x4e0d;&#x6703;&#x65b0;&#x589e;&#x5f8c;&#x53f0;&#x767b;&#x5165;&#x6b0a;&#x9650;&#x3002;&#x4fee;&#x6539;&#x59d3;&#x540d;&#x6703;&#x540c;&#x6b65;&#x986f;&#x793a;&#x65bc;&#x76f8;&#x95dc;&#x8ab2;&#x7a0b;&#x3002;</p>
                {!enabled && <p role="status" className="text-sm text-amber-900 mt-3">&#x6388;&#x8ab2;&#x6559;&#x7df4;&#x529f;&#x80fd;&#x5c1a;&#x672a;&#x555f;&#x7528;&#xff0c;&#x8acb;&#x806f;&#x7d61;&#x7ba1;&#x7406;&#x54e1;&#x66f4;&#x65b0;&#x7cfb;&#x7d71;&#x3002;</p>}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-4 min-w-0">
                    <form aria-label="&#x6388;&#x8ab2;&#x6559;&#x7df4;&#x8cc7;&#x6599;" onSubmit={save} className="min-w-0 space-y-3">
                        <label className="block text-sm font-bold">&#x6559;&#x7df4;&#x59d3;&#x540d;<input aria-label="&#x6559;&#x7df4;&#x59d3;&#x540d;" required maxLength={60} disabled={busy || !enabled} value={name} onChange={event => setName(event.target.value)} className="block w-full min-w-0 border rounded-lg p-3 mt-1 font-normal" /></label>
                        <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy || !enabled || !name.trim()} className="bg-slate-800 text-white rounded-lg px-4 py-3 font-bold disabled:opacity-50">{busy ? '\u5132\u5b58\u4e2d...' : editingId ? '\u5132\u5b58\u6559\u7df4\u59d3\u540d' : '\u65b0\u589e\u6559\u7df4'}</button>{editingId && <button type="button" disabled={busy} onClick={() => { setEditingId(''); setName(''); setError(''); setMessage(''); }} className="border rounded-lg px-4 py-3">&#x53d6;&#x6d88;&#x7de8;&#x8f2f;</button>}</div>
                        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
                        {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
                    </form>
                    <div className="min-w-0">{!coaches.length ? <p className="text-sm text-slate-500">&#x5c1a;&#x7121;&#x6388;&#x8ab2;&#x6559;&#x7df4;&#xff0c;&#x8acb;&#x5148;&#x65b0;&#x589e;&#x3002;</p> : <ul aria-label="&#x6388;&#x8ab2;&#x6559;&#x7df4;&#x540d;&#x55ae;" className="space-y-2 max-h-64 overflow-y-auto">{coaches.map(coach => <li key={coach.id} className="flex items-center justify-between gap-3 border rounded-lg p-3 min-w-0"><span className="text-sm break-all">{coach.name}</span><button type="button" aria-label={`\u7de8\u8f2f\u6559\u7df4\uff1a${coach.name}`} disabled={busy || !enabled} onClick={() => { setEditingId(coach.id); setName(coach.name); setError(''); setMessage(''); }} className="shrink-0 text-sm text-blue-700 border rounded-lg px-3 py-2">&#x7de8;&#x8f2f;</button></li>)}</ul>}</div>
                </div>
            </section>;
        };

        const MonthlyTariffSummary = ({ tariffs }) => (
            <div className="monthly-tariff-summary bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2 text-sm text-blue-950">
                <p className="font-bold">&#x6708;&#x7e73;&#x7d71;&#x4e00;&#x6536;&#x8cbb;&#xff0c;&#x4e0d;&#x5206;&#x6703;&#x54e1;&#x7b49;&#x7d1a;</p>
                {Object.entries(tariffs || {}).flatMap(([duration, plans]) => Object.entries(plans).map(([count, tariff]) => <p key={`${duration}-${count}`}>{duration === '60' ? '\u4e00\u5c0f\u6642' : '\u4e8c\u5c0f\u6642'} {count} &#x5802;&#xff1a;&#x539f;&#x50f9; NT$ {tariff.regular}&#xff0c;&#x512a;&#x60e0;&#x50f9; NT$ {tariff.price}</p>))}
            </div>
        );

        const EditSlotModal = ({ slot, onClose, onSuccess, teachingCoaches = [], supportsTeachingCoaches = false, monthlyTariffs = null }) => {
            const [form, setForm] = useState({ title: slot.title, date: slot.date, time: slot.time, location: slot.location || '', capacity: slot.capacity, prices: { ...slot.prices }, teachingCoachId: slot.teachingCoachId || '' });
            const [busy, setBusy] = useState(false);
            const busyRef = React.useRef(false);
            const [error, setError] = useState('');
            const isMonthly = /^\[\u6708\u7e73/.test(String(slot.title).trim());
            const save = async event => {
                event.preventDefault();
                if (busyRef.current) return;
                if (isMonthly && !monthlyTariffs) { setError('\u6708\u7e73\u7d71\u4e00\u50f9\u683c\u5c1a\u672a\u555f\u7528\uff0c\u8acb\u5148\u66f4\u65b0\u5f8c\u7aef\u3002'); return; }
                busyRef.current = true; setBusy(true); setError('');
                let saved = false;
                try {
                    const accessToken = typeof liff !== 'undefined' ? liff.getAccessToken() : null;
                    if (!accessToken) throw new Error('\u8acb\u91cd\u65b0\u767b\u5165 LINE\u3002');
                    const { teachingCoachId, ...fields } = form;
                    const result = await fetchAPI({ action: 'updateSlot', slotId: slot.id, ...fields, ...(supportsTeachingCoaches ? { teachingCoachId } : {}), accessToken });
                    if (!result || result.status !== 'success') throw new Error((result && result.message) || '\u8acb\u5148\u66f4\u65b0 Apps Script \u90e8\u7f72\uff0c\u652f\u63f4\u8ab2\u7a0b\u4fee\u6539\u3002');
                    saved = true; await onSuccess(); onClose();
                } catch (err) { setError(saved ? '\u5df2\u5132\u5b58\uff0c\u4f46\u91cd\u65b0\u8b80\u53d6\u5931\u6557\uff0c\u8acb\u95dc\u9589\u5f8c\u91cd\u65b0\u6574\u7406\u78ba\u8a8d\u3002' : err.message); }
                finally { busyRef.current = false; setBusy(false); }
            };
            return <div className="fixed inset-0 z-50 bg-slate-900 bg-opacity-60 p-3 flex items-center justify-center overflow-y-auto">
                <div role="dialog" aria-modal="true" aria-label="&#x7de8;&#x8f2f;&#x8ab2;&#x7a0b;" className="bg-white rounded-2xl w-full min-w-0 max-w-xl max-h-[90dvh] overflow-y-auto p-4 md:p-6 my-auto">
                    <h2 className="text-lg font-bold mb-3">&#x7de8;&#x8f2f;&#x5df2;&#x958b;&#x8ab2;&#x7a0b;</h2>
                    <p className="text-sm text-gray-600 mb-4">&#x5df2;&#x9810;&#x7d04; {Number(slot.capacity) - Number(slot.remaining)} &#x4eba;&#x3002;&#x4fee;&#x6539;&#x6536;&#x8cbb;&#x4e0d;&#x6703;&#x66f4;&#x52d5;&#x65e2;&#x6709;&#x8a02;&#x55ae;&#x91d1;&#x984d;&#xff1b;&#x4fee;&#x6539;&#x65e5;&#x671f;&#x8207;&#x6642;&#x9593;&#x6703;&#x5f71;&#x97ff;&#x65e2;&#x6709;&#x5b78;&#x751f;&#xff0c;&#x8acb;&#x53e6;&#x884c;&#x901a;&#x77e5;&#x3002;&#x6708;&#x7e73;&#x65e5;&#x671f;&#x53ca;&#x79c1;&#x4eba;&#x8ab2;&#x7a0b;&#x540d;&#x7a31;&#x8acb;&#x4fdd;&#x7559;&#x539f;&#x683c;&#x5f0f;&#x3002;</p>
                    {error && <p role="alert" className="bg-red-50 text-red-800 p-3 rounded-lg mb-3">{error}</p>}
                    <form onSubmit={save} className="space-y-4">
                        {supportsTeachingCoaches && <TeachingCoachSelect coaches={teachingCoaches} value={form.teachingCoachId} onChange={teachingCoachId => setForm(prev => ({ ...prev, teachingCoachId }))} disabled={busy} allowUnassigned={!slot.teachingCoachId} label="&#x7de8;&#x8f2f;&#x8ab2;&#x7a0b;&#x6388;&#x8ab2;&#x6559;&#x7df4;" />}
                        {[['title','\u8ab2\u7a0b\u540d\u7a31'],['date','\u4e0a\u8ab2\u65e5\u671f'],['time','\u4e0a\u8ab2\u6642\u9593'],['location','\u5834\u5730']].map(([key,label]) => <label key={key} className="block text-sm font-bold">{label}<input aria-label={label} required disabled={busy} value={form[key]} onChange={e => setForm(prev => ({...prev,[key]:e.target.value}))} className="block w-full min-w-0 border rounded-lg p-3 mt-1" /></label>)}
                        <label className="block text-sm font-bold">&#x7e3d;&#x540d;&#x984d;<input aria-label="&#x7e3d;&#x540d;&#x984d;" type="number" required min={Math.max(1, Number(slot.capacity)-Number(slot.remaining))} step="1" disabled={busy} value={form.capacity} onChange={e => setForm(prev=>({...prev,capacity:e.target.value}))} className="block w-full border rounded-lg p-3 mt-1" /></label>
                        <p className="text-sm text-blue-900 bg-blue-50 rounded-lg p-3">&#x55ae;&#x5802;&#x4e00;&#xff0f;&#x4e8c;&#x5c0f;&#x6642;&#x5718;&#x8ab2;&#x4f9d;&#x5b78;&#x54e1;&#x500b;&#x4eba;&#x50f9;&#x683c;&#x6536;&#x8cbb;&#xff1b;&#x8acb;&#x81f3;&#x300c;&#x5b78;&#x54e1;&#x540d;&#x55ae;&#x8207;&#x8cc7;&#x6599; &#x2192; &#x5718;&#x8ab2;&#x50f9;&#x683c;&#x300d;&#x8abf;&#x6574;&#xff0c;&#x672a;&#x8a2d;&#x5b9a;&#x4f7f;&#x7528;&#x539f;&#x50f9;&#x3002;</p>
                        {isMonthly ? <><MonthlyTariffSummary tariffs={monthlyTariffs} />{!slot.monthlyTariff?.fixed && <label className="block text-sm font-bold">&#x820a;&#x65b9;&#x6848;&#x7d71;&#x4e00;&#x6536;&#x8cbb;<input aria-label="&#x820a;&#x65b9;&#x6848;&#x7d71;&#x4e00;&#x6536;&#x8cbb;" type="number" min="0" step="0.01" required disabled={busy} value={form.prices[1] ?? ''} onChange={event => setForm(previous => ({ ...previous, prices: { ...previous.prices, 1: event.target.value } }))} className="block w-full border rounded-lg p-3 mt-1" /></label>}</> : (<fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-3"><legend className="font-bold mb-2">&#x5404;&#x7b49;&#x7d1a;&#x6536;&#x8cbb;</legend>{[1,2,3,4,5].map(level=><label key={level} className="block text-sm">{LEVEL_NAMES[level]}<input aria-label={`${LEVEL_NAMES[level]}\u6536\u8cbb`} type="number" min="0" step="any" required disabled={busy} value={form.prices[level] ?? ''} onChange={e=>setForm(prev=>({...prev,prices:{...prev.prices,[level]:e.target.value}}))} className="block w-full min-w-0 border rounded-lg p-3 mt-1" /></label>)}</fieldset>)}
                        <div className="flex gap-3"><button type="button" disabled={busy} onClick={onClose} className="flex-1 min-w-0 border rounded-lg p-3">&#x53d6;&#x6d88;</button><button type="submit" disabled={busy} className="flex-1 min-w-0 bg-blue-700 text-white rounded-lg p-3 font-bold disabled:opacity-50">{busy?'\u5132\u5b58\u4e2d...':'\u5132\u5b58\u4fee\u6539'}</button></div>
                    </form>
                </div>
            </div>;
        };

        const formatMoney = value => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 2 }).format(value);
        const studentPaymentKey = (lineId, studentId) => JSON.stringify([String(lineId), String(studentId ?? '')]);
        const taipeiMonth = value => {
            let text = value;
            if (typeof text === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(text)) text += 'T00:00:00+08:00';
            if (!(text instanceof Date) && (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(text))) return null;
            const date = text instanceof Date ? text : new Date(text);
            if (!Number.isFinite(date.getTime())) return null;
            const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit' }).formatToParts(date);
            return `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}`;
        };
        const VENUE_EXPENSE_LOCATIONS = ["\u95dc\u8056\u91cc\u6d3b\u52d5\u4e2d\u5fc3", "\u4e2d\u611b\u7fbd\u7403\u9928", "\u6c38\u5eb7\u5609\u4e16", "\u6c38\u5eb7\u9a30\u8000", "\u4ec1\u5fb7\u7fbd\u6f6e", "\u83ef\u4e2d\u7fbd\u7403\u9928", "\u5357\u5340\u7fbd\u6f6e", "\u79c1\u4eba\u7403\u9928"];

        const VenueExpenseForm = ({ expense, onSaved, onCancel }) => {
            const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
            const [form, setForm] = useState({ date: expense?.date || today, location: expense?.location || '', amount: expense?.amount ?? '', note: expense?.note || '' });
            const [busy, setBusy] = useState(false);
            const [error, setError] = useState('');
            const busyRef = React.useRef(false), requestRef = React.useRef(null);
            const formRef = React.useRef(null);
            useEffect(() => { if (expense) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [expense?.id]);
            const update = (key, value) => { setForm(previous => ({ ...previous, [key]: value })); requestRef.current = null; };
            const submit = async event => {
                event.preventDefault();
                if (busyRef.current) return;
                busyRef.current = true; setBusy(true); setError('');
                try {
                    if (!expense && !requestRef.current) requestRef.current = window.crypto?.randomUUID ? window.crypto.randomUUID() : 'venue-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
                    const result = await fetchAPI({ action: expense ? 'updateVenueExpense' : 'addVenueExpense', ...form, ...(expense ? { expenseId: expense.id, expectedRevision: expense.revision } : { requestId: requestRef.current }) });
                    if (result.status !== 'success' || result.monthlyAccountingVersion !== 1) throw new Error(result.message || '\u5834\u5730\u8cbb\u5132\u5b58\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002');
                    onSaved(result.expense);
                } catch (error) { setError(error.message); }
                finally { busyRef.current = false; setBusy(false); }
            };
            return <form ref={formRef} onSubmit={submit} className="venue-expense-form rounded-xl border border-emerald-200 bg-white p-4 space-y-4 mt-4">
                <h3 className="font-bold text-slate-800">{expense ? '\u7de8\u8f2f\u5834\u5730\u8cbb' : '\u88dc\u767b\u5834\u5730\u8cbb'}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="block text-sm font-bold">&#x5834;&#x5730;&#x4f7f;&#x7528;&#x65e5;&#x671f;<input aria-label="&#x5834;&#x5730;&#x4f7f;&#x7528;&#x65e5;&#x671f;" type="date" required disabled={busy} value={form.date} onChange={event => update('date', event.target.value)} className="block w-full min-w-0 border rounded-lg p-3 mt-1" /></label>
                    <label className="block text-sm font-bold">&#x5834;&#x5730;&#x8cbb;&#x91d1;&#x984d;<input aria-label="&#x5834;&#x5730;&#x8cbb;&#x91d1;&#x984d;" type="number" required min="0" step="0.01" disabled={busy} value={form.amount} onChange={event => update('amount', event.target.value)} className="block w-full min-w-0 border rounded-lg p-3 mt-1" /></label>
                </div>
                <label className="block text-sm font-bold">&#x5834;&#x5730;&#x540d;&#x7a31;<select aria-label="&#x5834;&#x5730;&#x540d;&#x7a31;" required disabled={busy} value={form.location} onChange={event => update('location', event.target.value)} className="block w-full min-w-0 border rounded-lg bg-white p-3 mt-1"><option value="">&#x8acb;&#x9078;&#x64c7;&#x5834;&#x5730;</option>{expense?.location && !VENUE_EXPENSE_LOCATIONS.includes(expense.location) && <option value={expense.location}>{expense.location}&#xff08;&#x539f;&#x7d00;&#x9304;&#xff09;</option>}{VENUE_EXPENSE_LOCATIONS.map(location => <option key={location} value={location} translate="no">{location}</option>)}</select></label>
                <label className="block text-sm font-bold">&#x5834;&#x5730;&#x8cbb;&#x5099;&#x8a3b;&#xff08;&#x9078;&#x586b;&#xff09;<input aria-label="&#x5834;&#x5730;&#x8cbb;&#x5099;&#x8a3b;&#xff08;&#x9078;&#x586b;&#xff09;" maxLength={1000} disabled={busy} value={form.note} onChange={event => update('note', event.target.value)} className="block w-full min-w-0 border rounded-lg p-3 mt-1" /></label>
                <p className="text-xs text-gray-600">&#x8cbb;&#x7528;&#x4f9d;&#x5834;&#x5730;&#x4f7f;&#x7528;&#x65e5;&#x671f;&#x6b78;&#x5c6c;&#x6708;&#x4efd;&#xff0c;&#x5176;&#x4ed6;&#x6708;&#x4efd;&#x7684;&#x8cbb;&#x7528;&#x4e0d;&#x6703;&#x6263;&#x5165;&#x672c;&#x6708;&#x3002;</p>
                {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
                <div className="flex flex-wrap gap-3 justify-end">{expense && <button type="button" disabled={busy} onClick={onCancel} className="border rounded-lg px-4 py-3">&#x53d6;&#x6d88;&#x7de8;&#x8f2f;</button>}<button type="submit" disabled={busy} className="rounded-lg bg-emerald-700 text-white font-bold px-4 py-3 disabled:opacity-50">{busy ? '\u5132\u5b58\u4e2d...' : '\u5132\u5b58\u5834\u5730\u8cbb'}</button></div>
            </form>;
        };

        const CoachRevenue = ({ revision }) => {
            const [data, setData] = useState(null);
            const [error, setError] = useState('');
            const [refresh, setRefresh] = useState(0);
            const [loading, setLoading] = useState(true);
            const [editingExpense, setEditingExpense] = useState(null);
            const [formRevision, setFormRevision] = useState(0);
            const [costBusy, setCostBusy] = useState('');
            const [costError, setCostError] = useState('');
            const [message, setMessage] = useState('');
            const costBusyRef = React.useRef(false);
            const month = taipeiMonth(new Date());
            useEffect(() => {
                let active = true;
                setLoading(true); setError('');
                fetchAPI({ action: 'getPaymentSummary', month }).then(result => {
                    if (!result || !result.paymentSummary || result.status !== 'success') throw new Error(result?.message || '\u7121\u6cd5\u8b80\u53d6\u6536\u652f\u8cc7\u6599');
                    if (result.paymentSummary.monthlyAccountingVersion !== 1) throw new Error('\u6708\u4efd\u6536\u652f\u529f\u80fd\u5c1a\u672a\u555f\u7528\uff0c\u8acb\u5148\u66f4\u65b0\u5f8c\u7aef\u3002');
                    if (active) setData(result.paymentSummary);
                }).catch(error => { if (active) { setData(null); setError(error.message); } }).finally(() => { if (active) setLoading(false); });
                return () => { active = false; };
            }, [revision, refresh, month]);
            const saved = expense => {
                setEditingExpense(null); setFormRevision(n => n + 1); setCostError('');
                setMessage(expense.date.slice(0, 7) === month ? '\u5834\u5730\u8cbb\u5df2\u5132\u5b58\uff0c\u5df2\u91cd\u65b0\u8a08\u7b97\u672c\u6708\u6536\u652f\u3002' : '\u5834\u5730\u8cbb\u5df2\u5132\u5b58\uff1b\u5176\u4ed6\u6708\u4efd\u7684\u8cbb\u7528\u4e0d\u5f71\u97ff\u672c\u6708\u3002');
                setRefresh(n => n + 1);
            };
            const cancelExpense = async expense => {
                if (costBusyRef.current || !confirm(`\u78ba\u5b9a\u4f5c\u5ee2\u9019\u7b46\u5834\u5730\u8cbb\uff1f\n${expense.date} \u00b7 ${expense.location} \u00b7 ${formatMoney(expense.amount)}\n\u4f5c\u5ee2\u5f8c\u4e0d\u518d\u6263\u5165\u6708\u7d2f\u7a4d\u91d1\u984d\uff0c\u539f\u7d00\u9304\u4ecd\u4fdd\u7559\u3002`)) return;
                costBusyRef.current = true; setCostBusy(expense.id); setCostError(''); setMessage('');
                try {
                    const result = await fetchAPI({ action: 'cancelVenueExpense', expenseId: expense.id, expectedRevision: expense.revision });
                    if (result.status !== 'success' || result.monthlyAccountingVersion !== 1) throw new Error(result.message || '\u5834\u5730\u8cbb\u4f5c\u5ee2\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002');
                    setEditingExpense(null); setMessage('\u5834\u5730\u8cbb\u5df2\u4f5c\u5ee2\uff0c\u5df2\u91cd\u65b0\u8a08\u7b97\u672c\u6708\u6536\u652f\u3002'); setRefresh(n => n + 1);
                } catch (error) { setCostError(error.message); }
                finally { costBusyRef.current = false; setCostBusy(''); }
            };
            return <section aria-label="&#x672c;&#x6708;&#x6536;&#x652f;&#x7d71;&#x8a08;" className="coach-revenue bg-emerald-50 border border-emerald-200 rounded-2xl p-4 md:p-6 mb-5 min-w-0">
                <div className="flex flex-wrap justify-between items-center gap-3"><h2 className="font-bold text-emerald-950">{month} &#x672c;&#x6708;&#x7d2f;&#x7a4d;&#x91d1;&#x984d;</h2><button onClick={() => { setEditingExpense(null); setRefresh(n => n + 1); }} disabled={loading || !!costBusy} className="border border-emerald-300 rounded-lg px-3 py-2 text-sm text-emerald-900 disabled:opacity-50">&#x91cd;&#x65b0;&#x6574;&#x7406;&#x6536;&#x652f;</button></div>
                {loading ? <p role="status" className="mt-3">&#x8b80;&#x53d6;&#x6536;&#x652f;&#x4e2d;...</p> : error ? <p role="alert" className="text-red-700 mt-3">{error}</p> : data && <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                        <div aria-label="&#x672c;&#x6708;&#x5b78;&#x8cbb;" className="bg-white border rounded-xl p-4 min-w-0"><p className="text-sm text-slate-600">&#x672c;&#x6708;&#x8ab2;&#x7a0b;&#x5b78;&#x8cbb;</p><p className="text-2xl font-bold text-emerald-800 break-all">{formatMoney(data.monthlyTuitionTotal)}</p></div>
                        <div aria-label="&#x672c;&#x6708;&#x5834;&#x5730;&#x8cbb;" className="bg-white border rounded-xl p-4 min-w-0"><p className="text-sm text-slate-600">&#x672c;&#x6708;&#x5834;&#x5730;&#x8cbb;</p><p className="text-2xl font-bold text-amber-800 break-all">{formatMoney(data.monthlyVenueCostTotal)}</p></div>
                        <div aria-label="&#x672c;&#x6708;&#x7d2f;&#x7a4d;&#x91d1;&#x984d;" className="bg-white border rounded-xl p-4 min-w-0"><p className="text-sm text-slate-600">&#x672c;&#x6708;&#x7d2f;&#x7a4d;&#x91d1;&#x984d;</p><p className={`text-2xl font-extrabold break-all ${data.monthlyTotal < 0 ? 'text-red-700' : 'text-emerald-800'}`}>{formatMoney(data.monthlyTotal)}</p></div>
                    </div>
                    <p className="text-xs text-emerald-950 mt-3">&#x672c;&#x6708;&#x7d2f;&#x7a4d;&#x91d1;&#x984d;&#xff1d;&#x672c;&#x6708;&#x4e0a;&#x8ab2;&#x5b78;&#x8cbb;&#xff0d;&#x672c;&#x6708;&#x5834;&#x5730;&#x8cbb;&#x3002;&#x4f9d;&#x53f0;&#x5317;&#x6642;&#x9593;&#x7684;&#x4e0a;&#x8ab2;&#x6708;&#x4efd;&#x7d71;&#x8a08;&#xff0c;&#x8de8;&#x6708;&#x6708;&#x7e73;&#x6309;&#x5404;&#x6708;&#x5802;&#x6578;&#x5206;&#x6524;&#xff1b;&#x5834;&#x5730;&#x8cbb;&#x4f9d;&#x4f7f;&#x7528;&#x65e5;&#x671f;&#x6b78;&#x5c6c;&#x6708;&#x4efd;&#x3002;</p>
                    <p className="text-xs text-gray-600 mt-2">&#x5b78;&#x8cbb;&#x8a08;&#x5165;&#x5df2;&#x6838;&#x51c6;&#x53ca;&#x5df2;&#x5b8c;&#x8ab2;&#x8a02;&#x55ae;&#xff1b;&#x5be9;&#x6838;&#x4e2d;&#x3001;&#x5df2;&#x53d6;&#x6d88;&#x3001;&#x5c1a;&#x672a;&#x78ba;&#x8a8d;&#x73fe;&#x91d1;&#x6536;&#x6b3e;&#x4e0d;&#x8a08;&#xff0c;&#x6b77;&#x53f2;&#x88dc;&#x767b;&#x9808;&#x5df2;&#x6536;&#x6b3e;&#x3002;&#x5b78;&#x54e1;&#x500b;&#x4eba;&#x7d2f;&#x7a4d;&#x4ed8;&#x6b3e;&#x4e0d;&#x6263;&#x9664;&#x5834;&#x5730;&#x8cbb;&#x3002;</p>
                    {(data.invalidAmounts + data.missingDates + data.duplicateOrders + data.unmatchedStudents > 0) && <p role="status" className="text-sm text-amber-900 mt-3">&#x8cc7;&#x6599;&#x5f85;&#x6838;&#x5c0d;&#xff1a;&#x91d1;&#x984d;&#x7570;&#x5e38; {data.invalidAmounts} &#x7b46;&#x3001;&#x7f3a;&#x5c11;&#x6709;&#x6548;&#x4e0a;&#x8ab2;&#x65e5;&#x671f; {data.missingDates} &#x7b46;&#x3001;&#x91cd;&#x8907;&#x8a02;&#x55ae;&#x7de8;&#x865f; {data.duplicateOrders} &#x7b46;&#x3001;&#x7121;&#x6cd5;&#x5c0d;&#x61c9;&#x5b78;&#x54e1; {data.unmatchedStudents} &#x7b46;&#x3002;&#x65e5;&#x671f;&#x7f3a;&#x6f0f;&#x4e0d;&#x8a08;&#x6708;&#x4efd;&#x5b78;&#x8cbb;&#xff0c;&#x91cd;&#x8907;&#x8a02;&#x55ae;&#x53ea;&#x8a08;&#x4e00;&#x6b21;&#x3002;</p>}
                    {message && <p role="status" className="text-sm text-emerald-800 mt-3">{message}</p>}{costError && <p role="alert" className="text-sm text-red-700 mt-3">{costError}</p>}
                    <VenueExpenseForm key={`${editingExpense?.id || 'new'}-${formRevision}`} expense={editingExpense} onSaved={saved} onCancel={() => setEditingExpense(null)} />
                    <div className="mt-5 min-w-0"><h3 className="font-bold text-slate-800 mb-3">&#x672c;&#x6708;&#x5834;&#x5730;&#x8cbb;&#x660e;&#x7d30;</h3>{!data.venueExpenses.length ? <p className="text-sm text-gray-600">&#x672c;&#x6708;&#x5c1a;&#x7121;&#x5834;&#x5730;&#x8cbb;&#x7d00;&#x9304;&#x3002;</p> : <div className="mobile-list-wrap overflow-x-auto"><table className="mobile-card-table w-full text-left text-sm"><thead><tr><th className="p-3">&#x4f7f;&#x7528;&#x65e5;&#x671f;</th><th className="p-3">&#x5834;&#x5730;</th><th className="p-3">&#x91d1;&#x984d;</th><th className="p-3">&#x5099;&#x8a3b;</th><th className="p-3">&#x64cd;&#x4f5c;</th></tr></thead><tbody>{data.venueExpenses.map(expense => <tr key={expense.id} className="border-t"><td data-label="&#x4f7f;&#x7528;&#x65e5;&#x671f;" className="p-3">{expense.date}</td><td data-label="&#x5834;&#x5730;" className="p-3 break-words">{expense.location}</td><td data-label="&#x91d1;&#x984d;" className="p-3 font-bold">{formatMoney(expense.amount)}</td><td data-label="&#x5099;&#x8a3b;" className="p-3 break-words">{expense.note || '\u2014'}</td><td data-label="&#x64cd;&#x4f5c;" className="p-3"><div className="flex flex-wrap gap-2"><button type="button" disabled={!!costBusy} onClick={() => { setEditingExpense(expense); setMessage(''); }} className="border rounded-lg px-3 py-2 text-blue-800">&#x7de8;&#x8f2f;&#x5834;&#x5730;&#x8cbb;</button><button type="button" disabled={!!costBusy} onClick={() => cancelExpense(expense)} className="border rounded-lg px-3 py-2 text-red-700">{costBusy === expense.id ? '\u8655\u7406\u4e2d...' : '\u4f5c\u5ee2\u5834\u5730\u8cbb'}</button></div></td></tr>)}</tbody></table></div>}</div>
                    <details className="mt-5 border-t border-emerald-200 pt-4"><summary className="font-bold cursor-pointer text-slate-800">&#x672c;&#x6708;&#x5b78;&#x8cbb;&#x660e;&#x7d30;</summary>{!data.tuitionDetails.length ? <p className="text-sm text-gray-600 mt-3">&#x672c;&#x6708;&#x5c1a;&#x7121;&#x7b26;&#x5408;&#x6536;&#x6b3e;&#x689d;&#x4ef6;&#x7684;&#x8ab2;&#x7a0b;&#x5b78;&#x8cbb;&#x3002;</p> : <div className="mobile-list-wrap overflow-x-auto mt-3"><table className="mobile-card-table w-full text-left text-sm"><thead><tr><th className="p-3">&#x4e0a;&#x8ab2;&#x65e5;&#x671f;</th><th className="p-3">&#x5b78;&#x54e1;</th><th className="p-3">&#x8ab2;&#x7a0b;</th><th className="p-3">&#x672c;&#x6708;&#x5b78;&#x8cbb;</th></tr></thead><tbody>{data.tuitionDetails.map((detail, index) => <tr key={detail.bookingId || index} className="border-t"><td data-label="&#x4e0a;&#x8ab2;&#x65e5;&#x671f;" className="p-3 break-words">{detail.dates.join('\u3001')}</td><td data-label="&#x5b78;&#x54e1;" className="p-3">{detail.name || '\u672a\u63d0\u4f9b\u59d3\u540d'}</td><td data-label="&#x8ab2;&#x7a0b;" className="p-3 break-words">{detail.title || '\u672a\u63d0\u4f9b\u8ab2\u540d'}<span className="block text-xs text-gray-500">&#x672c;&#x6708; {detail.sessionCount}&#xff0f;&#x5171; {detail.totalSessions} &#x5802;</span></td><td data-label="&#x672c;&#x6708;&#x5b78;&#x8cbb;" className="p-3 font-bold">{formatMoney(detail.amount)}</td></tr>)}</tbody></table></div>}</details>
                </>}
            </section>;
        };

        const coachCalendarDateKey = (year, month, day) => {
            const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
            if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day)) return null;
            return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        };
        const coachSlotDates = slot => {
            const raw = slot?.date instanceof Date ? slot.date.toISOString() : String(slot?.date || '').trim();
            const text = formatTrainingDate(raw);
            const single = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s|$)/);
            if (single) return [coachCalendarDateKey(single[1], single[2], single[3])].filter(Boolean);
            const year = raw.match(/^(\d{4})\u5e74/);
            if (!year) return [];
            return [...new Set([...raw.matchAll(/(\d{1,2})\/(\d{1,2})/g)].map(match => coachCalendarDateKey(year[1], match[1], match[2])).filter(Boolean))];
        };
        const coachCourseStartMinutes = course => {
            const match = String(course.slot.time || '').match(/^(\d{1,2}):(\d{2})/);
            return match ? Number(match[1]) * 60 + Number(match[2]) : Infinity;
        };
        const coachCalendarMonthData = (slots, bookings, monthKey) => {
            if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) throw new Error('\u8acb\u9078\u64c7\u6709\u6548\u6708\u4efd\u3002');
            const [year, month] = monthKey.split('-').map(Number), byDate = new Map(), bySlot = new Map();
            let unparsed = 0;
            bookings.forEach(booking => {
                if (!booking.slotId || booking.status === '\u5df2\u53d6\u6d88') return;
                const key = String(booking.slotId);
                if (!bySlot.has(key)) bySlot.set(key, []);
                bySlot.get(key).push(booking);
            });
            slots.forEach(slot => {
                const dates = coachSlotDates(slot);
                if (!slot.id || !dates.length) { unparsed++; return; }
                const orders = bySlot.get(String(slot.id)) || [];
                const capacity = Number(slot.capacity), remaining = Number(slot.remaining);
                const occupied = Number.isFinite(capacity) && Number.isFinite(remaining) ? Math.max(0, capacity - remaining) : 0;
                dates.filter(date => date.startsWith(monthKey + '-')).forEach(date => {
                    if (!byDate.has(date)) byDate.set(date, []);
                    byDate.get(date).push({ slot, orders, occupied, reserved: orders.length > 0 || occupied > 0 });
                });
            });
            const leading = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
            const days = Array.from({ length: new Date(Date.UTC(year, month, 0)).getUTCDate() }, (_, index) => {
                const date = coachCalendarDateKey(year, month, index + 1);
                const courses = (byDate.get(date) || []).sort((a, b) => coachCourseStartMinutes(a) - coachCourseStartMinutes(b) || String(a.slot.title).localeCompare(String(b.slot.title)));
                return { date, day: index + 1, courses, reservedCount: courses.filter(course => course.reserved).length, teachingCoachNames: [...new Set(courses.map(course => course.slot.teachingCoachName).filter(Boolean))] };
            });
            return { leading, days, unparsed };
        };

        const CoachCourseCalendar = ({ slots, bookings, onEdit }) => {
            const today = registrationToday();
            const [month, setMonth] = useState(today.slice(0, 7));
            const [selectedDate, setSelectedDate] = useState(today);
            const data = React.useMemo(() => coachCalendarMonthData(slots, bookings, month), [slots, bookings, month]);
            const selected = data.days.find(day => day.date === selectedDate);
            const moveMonth = direction => {
                const [year, number] = month.split('-').map(Number);
                const date = new Date(Date.UTC(year, number - 1 + direction, 1));
                const next = date.toISOString().slice(0, 7);
                setMonth(next); setSelectedDate(next + '-01');
            };
            return <section aria-label="&#x8ab2;&#x7a0b;&#x884c;&#x4e8b;&#x66c6;" className="bg-white rounded-2xl shadow-sm border p-4 md:p-6 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h2 className="text-lg font-bold text-slate-800">&#x8ab2;&#x7a0b;&#x884c;&#x4e8b;&#x66c6;</h2>
                    <div className="flex flex-wrap gap-3 text-xs"><span className="text-sky-700">&#x5df2;&#x958b;&#x8ab2;&#x7a0b;</span><span className="text-amber-800">&#x5df2;&#x6709;&#x9810;&#x7d04;&#xff08;&#x542b;&#x5be9;&#x6838;&#x4e2d;&#xff09;</span></div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-w-0">
                    <div className="min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-3">
                            <button type="button" aria-label="&#x4e0a;&#x4e00;&#x500b;&#x6708;" onClick={() => moveMonth(-1)} className="border rounded-lg px-3 py-2 text-slate-600">&#x2039;</button>
                            <span className="font-bold text-slate-800">{month}</span>
                            <div className="flex gap-2"><button type="button" onClick={() => { setMonth(today.slice(0, 7)); setSelectedDate(today); }} className="text-sm border rounded-lg px-3 py-2">&#x4eca;&#x5929;</button><button type="button" aria-label="&#x4e0b;&#x4e00;&#x500b;&#x6708;" onClick={() => moveMonth(1)} className="border rounded-lg px-3 py-2 text-slate-600">&#x203a;</button></div>
                        </div>
                        <div className="grid grid-cols-7 text-center text-xs font-bold text-slate-500 mb-2">{['\u9031\u65e5','\u9031\u4e00','\u9031\u4e8c','\u9031\u4e09','\u9031\u56db','\u9031\u4e94','\u9031\u516d'].map(day => <span key={day}>{day}</span>)}</div>
                        <div role="group" aria-label="&#x6559;&#x7df4;&#x8ab2;&#x7a0b;&#x6708;&#x4efd;" className="grid grid-cols-7 gap-1">
                            {Array.from({ length: data.leading }, (_, index) => <div key={`blank-${index}`} />)}
                            {data.days.map(day => <button key={day.date} type="button" aria-label={`${day.date}\uff1a\u5df2\u958b\u8ab2\u7a0b ${day.courses.length} \u5802\uff0c\u5df2\u6709\u9810\u7d04 ${day.reservedCount} \u5802`} aria-pressed={day.date === selectedDate} onClick={() => setSelectedDate(day.date)} className={`min-w-0 min-h-[76px] rounded-lg px-0.5 py-1 flex flex-col items-center gap-1 border ${day.date === selectedDate ? 'border-emerald-600 bg-emerald-50' : 'border-transparent hover:bg-slate-50'} ${day.date === today ? 'font-bold' : ''}`}>
                                <span className="text-sm text-slate-800">{day.day}</span>
                                {day.courses.length > 0 && <span className="text-[9px] sm:text-[10px] text-sky-700 whitespace-nowrap">&#x958b; {day.courses.length}</span>}
                                {day.reservedCount > 0 && <span className="text-[9px] sm:text-[10px] text-amber-800 whitespace-nowrap">&#x9810;&#x7d04; {day.reservedCount}</span>}
                                {day.teachingCoachNames.length > 0 && <span title={day.teachingCoachNames.join('\u3001')} className="block w-full truncate text-[9px] sm:text-[10px] text-slate-500">{day.teachingCoachNames.join('\u3001')}</span>}
                            </button>)}
                        </div>
                        {data.unparsed > 0 && <p role="status" className="text-xs text-amber-800 mt-3">&#x8ab2;&#x7a0b;&#x65e5;&#x671f;&#x5f85;&#x6838;&#x5c0d;&#xff1a;{data.unparsed} &#x7b46;&#x3002;&#x8acb;&#x6838;&#x5c0d;&#x5df2;&#x958b;&#x8ab2;&#x7a0b;&#x8cc7;&#x6599;&#x3002;</p>}
                    </div>
                    <div aria-label="&#x7576;&#x65e5;&#x8ab2;&#x7a0b;&#x8207;&#x9810;&#x7d04;" className="min-w-0">
                        <h3 className="font-bold text-slate-800 mb-3">{selectedDate} &#xb7; &#x7576;&#x65e5;&#x8ab2;&#x7a0b;</h3>
                        {!selected?.courses.length ? <p className="text-sm text-slate-500 border border-dashed rounded-xl p-5">&#x672c;&#x65e5;&#x7121;&#x6392;&#x5b9a;&#x8ab2;&#x7a0b;</p> : <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
                            {selected.courses.map(({ slot, orders, occupied, reserved }) => <article key={slot.id} className="border rounded-xl p-4 bg-slate-50 min-w-0">
                                <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="font-bold text-sm text-slate-800 break-words">{/^\[\u5c08\u5c6c\u6559\u7df4\u8ab2\]/.test(slot.title) ? '\u6559\u7df4\u958b\u653e\u6642\u6bb5' : slot.title}</h4><span className={`text-xs rounded px-2 py-1 ${reserved ? 'bg-amber-100 text-amber-900' : 'bg-sky-100 text-sky-800'}`}>{reserved ? '\u5df2\u6709\u9810\u7d04' : '\u5df2\u958b\u8ab2\u7a0b'}</span></div>
                                <p className="text-sm text-slate-600 mt-2">{slot.time} &#xb7; {String(slot.location || '').startsWith('coach_loc:') ? '\u5b78\u54e1\u81ea\u9078\u5834\u5730' : slot.location}</p>
                                <p className="text-sm text-slate-700 mt-2 break-words">&#x6388;&#x8ab2;&#x6559;&#x7df4;&#xff1a;{slot.teachingCoachName || '\u672a\u6307\u5b9a'}</p>
                                <p className="text-xs text-slate-500 mt-2">&#x5df2;&#x4f54;&#x540d;&#x984d; {occupied} &#xb7; &#x5269;&#x9918;&#x540d;&#x984d; {slot.remaining}</p>
                                {orders.length > 0 && <details className="text-sm mt-3"><summary className="cursor-pointer font-bold text-slate-700">&#x9810;&#x7d04;&#x540d;&#x55ae;&#xff08;{orders.length} &#x4eba;&#xff09;</summary><ul className="space-y-2 mt-2">{orders.map((booking, index) => <li key={`${booking.bookingId || 'legacy'}-${index}`} className="flex flex-wrap justify-between gap-2 border-t pt-2"><span>{booking.name}</span><span className="text-xs text-slate-500">{booking.status}</span></li>)}</ul></details>}
                                <button type="button" onClick={() => onEdit(slot)} className="text-sm text-blue-700 font-bold mt-3 px-3 py-2 bg-white border border-blue-100 rounded-lg">&#x7de8;&#x8f2f;&#x8ab2;&#x7a0b;</button>
                            </article>)}
                        </div>}
                    </div>
                </div>
            </section>;
        };

        const CoachGroupRegistration = ({ members, slots, onSuccess, kind = 'monthly', enabled = true }) => {
            const isMonthly = kind === 'monthly';
            const title = isMonthly ? '\u4ee3\u767b\u8a18\u6708\u7e73\u5718\u8ab2' : '\u4ee3\u767b\u8a18\u55ae\u5802\u5718\u8ab2';
            const courseLabel = isMonthly ? '\u6708\u7e73\u8ab2\u7a0b' : '\u55ae\u5802\u8ab2\u7a0b';
            const accounts = React.useMemo(() => {
                const grouped = new Map();
                members.forEach(member => {
                    if (!member.lineId) return;
                    if (!grouped.has(member.lineId)) grouped.set(member.lineId, []);
                    grouped.get(member.lineId).push(member);
                });
                return [...grouped].map(([lineId, students]) => ({ lineId, students }));
            }, [members]);
            const [lineId, setLineId] = useState('');
            const [studentIds, setStudentIds] = useState([]);
            const [slotId, setSlotId] = useState('');
            const [busy, setBusy] = useState(false);
            const [message, setMessage] = useState('');
            const [error, setError] = useState('');
            const busyRef = React.useRef(false);
            const account = accounts.find(account => account.lineId === lineId);
            const selected = (account?.students || []).filter(student => studentIds.includes(student.studentId || ''));
            const courseSlots = slots.filter(slot => isMonthly ? /^\[\u6708\u7e73/.test(slot.title.trim()) : !/^\[(\u6708\u7e73|\u5c08\u5c6c\u6559\u7df4\u8ab2)/.test(slot.title.trim()));
            const slot = courseSlots.find(slot => slot.id === slotId);
            const [quote, setQuote] = useState(null);
            const quoteRequest = React.useRef(0);
            const selectedKey = JSON.stringify(studentIds);
            useEffect(() => {
                const request = ++quoteRequest.current;
                setQuote(null);
                if (!enabled || !lineId || !slotId || !studentIds.length) return;
                fetchAPI({ action: 'getBookingQuote', lineId, slotId, kind: isMonthly ? 'monthly' : 'single', studentIds }).then(result => {
                    if (request !== quoteRequest.current) return;
                    if (result.status !== 'success' || !result.quote) { setError(result.message || '\u7121\u6cd5\u53d6\u5f97\u8ab2\u7a0b\u5831\u50f9\uff0c\u8acb\u91cd\u65b0\u8b80\u53d6\u3002'); return; }
                    setQuote(result.quote); setError('');
                });
                return () => { quoteRequest.current++; };
            }, [enabled, lineId, slotId, selectedKey, isMonthly, slots, members]);
            const validPrice = !!quote;
            const ready = enabled && selected.length > 0 && slot && quote?.eligible;
            const submit = async event => {
                event.preventDefault();
                if (busyRef.current || !ready) return;
                if (!confirm(`${isMonthly ? '\u78ba\u8a8d\u4ee3\u767b\u8a18\u6708\u7e73\u5718\u8ab2\uff1f' : '\u78ba\u8a8d\u4ee3\u767b\u8a18\u55ae\u5802\u5718\u8ab2\uff1f'}\n${selected.map(student => student.name).join('\u3001')}\n${slot.title} \u00b7 ${slot.date} ${slot.time}\n\u5171 ${selected.length} \u4eba\uff0c\u5408\u8a08 NT$ ${quote.totalPrice}\n\u767b\u8a18\u5f8c\u70ba\u5be9\u6838\u4e2d\uff0c\u6536\u6b3e\u5f8c\u8acb\u518d\u6838\u51c6\u9810\u7d04\u3002`)) return;
                busyRef.current = true; setBusy(true); setMessage(''); setError('');
                try {
                    const accessToken = typeof liff !== 'undefined' ? liff.getAccessToken() : null;
                    if (!accessToken) throw new Error('\u8acb\u91cd\u65b0\u767b\u5165 LINE\u3002');
                    const result = await fetchAPI({ action: isMonthly ? 'coachRegisterMonthly' : 'coachRegisterSingle', lineId, studentIds, slotId, expectedTotalPrice: quote.totalPrice, expectedStudentPrices: quote.studentPrices, accessToken });
                    if (result.status !== 'success') throw new Error(result.message || '\u767b\u8a18\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002');
                    if (result.registeredCount !== selected.length) throw new Error('\u767b\u8a18\u7d50\u679c\u4eba\u6578\u4e0d\u4e00\u81f4\uff0c\u8acb\u91cd\u65b0\u6574\u7406\u9810\u7d04\u540d\u55ae\u78ba\u8a8d\u3002');
                    setMessage(`\u5df2\u767b\u8a18 ${result.registeredCount} \u4f4d\u5b78\u751f\uff0c\u5408\u8a08 NT$ ${result.totalPrice}\uff0c\u72c0\u614b\u70ba\u5be9\u6838\u4e2d\u3002`);
                    setStudentIds([]); setSlotId('');
                    await onSuccess();
                } catch (error) { setError(error.message); }
                finally { busyRef.current = false; setBusy(false); }
            };
            return <section aria-labelledby={`coach-${kind}-registration-title`} className="bg-sky-50 border border-sky-200 rounded-2xl p-4 md:p-6">
                <h2 id={`coach-${kind}-registration-title`} className="font-bold text-lg text-sky-950 mb-2">{title}</h2>
                <p className="text-sm text-sky-900 mb-4">{isMonthly ? '\u9078\u64c7\u5df2\u8a3b\u518a\u5b78\u54e1\uff0c\u4f9d\u6708\u7e73\u65b9\u6848\u7d71\u4e00\u8a08\u8cbb\uff0c\u4e0d\u5206\u6703\u54e1\u7b49\u7d1a\uff1b\u767b\u8a18\u5f8c\u70ba\u5be9\u6838\u4e2d\uff0c\u78ba\u8a8d\u6536\u6b3e\u5f8c\u518d\u6838\u51c6\u3002' : '\u9078\u64c7\u5df2\u8a3b\u518a\u5b78\u54e1\uff0c\u4f9d\u5404\u5b78\u54e1\u7684\u500b\u4eba\u5718\u8ab2\u50f9\u683c\u8a08\u8cbb\uff1b\u672a\u8a2d\u5b9a\u4f7f\u7528\u539f\u50f9\u3002\u767b\u8a18\u5f8c\u70ba\u5be9\u6838\u4e2d\uff0c\u78ba\u8a8d\u6536\u6b3e\u5f8c\u518d\u6838\u51c6\u3002'}</p>
                {!enabled && <p role="status" className="text-sm text-amber-800 mb-4">{isMonthly ? '\u6708\u7e73\u7d71\u4e00\u50f9\u683c\u5c1a\u672a\u555f\u7528\uff0c\u8acb\u5148\u66f4\u65b0\u5f8c\u7aef\u3002' : '\u55ae\u5802\u4ee3\u767b\u8a18\u5c1a\u672a\u555f\u7528\uff0c\u8acb\u806f\u7d61\u7ba1\u7406\u54e1\u66f4\u65b0\u7cfb\u7d71\u3002'}</p>}
                <form onSubmit={submit} className="coach-monthly-form space-y-4">
                    <label className="block font-bold">&#x5b78;&#x54e1;&#x5e33;&#x865f;<select aria-label={isMonthly ? '\u4ee3\u767b\u8a18\u5b78\u54e1\u5e33\u865f' : '\u55ae\u5802\u4ee3\u767b\u8a18\u5b78\u54e1\u5e33\u865f'} disabled={busy} required value={lineId} onChange={e => { const next = accounts.find(account => account.lineId === e.target.value); setLineId(e.target.value); setStudentIds((next?.students || []).map(student => student.studentId || '')); setMessage(''); setError(''); }} className="block w-full border p-3 rounded-lg mt-1 bg-white"><option value="">&#x8acb;&#x9078;&#x64c7;&#x5b78;&#x54e1;&#x5e33;&#x865f;</option>{accounts.map(account => <option key={account.lineId} value={account.lineId}>{account.students.map(student => student.name + (student.nickname ? `\uff08${student.nickname}\uff09` : '')).join('\u3001')}</option>)}</select></label>
                    {account && <fieldset disabled={busy} className="border rounded-lg p-3 bg-white"><legend className="font-bold">&#x53c3;&#x52a0;&#x5b78;&#x751f;</legend>{account.students.map((student, index) => <label key={student.studentId || index} className="flex gap-2 items-center p-2"><input type="checkbox" checked={studentIds.includes(student.studentId || '')} onChange={e => setStudentIds(previous => e.target.checked ? [...previous, student.studentId || ''] : previous.filter(id => id !== (student.studentId || '')))} />{student.name}{student.nickname ? `\uff08${student.nickname}\uff09` : ''}</label>)}</fieldset>}
                    <label className="block font-bold">{courseLabel}<select aria-label={isMonthly ? '\u4ee3\u767b\u8a18\u6708\u7e73\u8ab2\u7a0b' : '\u4ee3\u767b\u8a18\u55ae\u5802\u8ab2\u7a0b'} disabled={busy} required value={slotId} onChange={e => { setSlotId(e.target.value); setMessage(''); setError(''); }} className="block w-full border p-3 rounded-lg mt-1 bg-white"><option value="">{isMonthly ? '\u8acb\u9078\u64c7\u6708\u7e73\u8ab2\u7a0b' : '\u8acb\u9078\u64c7\u55ae\u5802\u8ab2\u7a0b'}</option>{courseSlots.map(slot => <option key={slot.id} value={slot.id} disabled={Number(slot.remaining) < Math.max(1, selected.length)}>{slot.title} &#xb7; {slot.date} {slot.time} &#xb7; {slot.location}&#xff08;&#x5269; {slot.remaining} &#x540d;&#xff09;</option>)}</select></label>
                    {courseSlots.length === 0 && <p className="text-sm">{isMonthly ? '\u76ee\u524d\u6c92\u6709\u6708\u7e73\u8ab2\u7a0b\uff0c\u8acb\u5148\u65b0\u589e\u8ab2\u7a0b\u3002' : '\u76ee\u524d\u6c92\u6709\u55ae\u5802\u5718\u8ab2\uff0c\u8acb\u5148\u65b0\u589e\u8ab2\u7a0b\u3002'}</p>}
                    <p className="font-bold">&#x767b;&#x8a18; {selected.length} &#x4eba;{validPrice ? ` \u00b7 \u5408\u8a08 NT$ ${quote.totalPrice}` : ''}</p>
                    <GroupQuotePrices quote={quote} />
                    {message && <p role="status" className="text-emerald-800">{message}</p>}{error && <p role="alert" className="text-red-700">{error}</p>}
                    <button type="submit" disabled={busy || !ready} className="bg-sky-700 text-white rounded-lg px-4 py-3 font-bold disabled:opacity-50">{busy ? '\u767b\u8a18\u4e2d...' : '\u78ba\u8a8d\u4ee3\u767b\u8a18'}</button>
                </form>
            </section>;
        };

        const coachBookingCourseInfo = (booking, slots = []) => {
            const matches = booking.slotId == null || booking.slotId === '' ? [] : slots.filter(slot => slot.id != null && String(slot.id) === String(booking.slotId));
            const slot = matches.length === 1 ? matches[0] : null;
            const format = value => formatTrainingDate(value instanceof Date ? value.toISOString() : value);
            const title = String(slot?.title || booking.slotTitle || '').trim();
            const date = format(slot?.date) || format(booking.slotDate) || (Array.isArray(booking.courseDates) ? booking.courseDates.map(format).filter(Boolean).join('\u3001') : '');
            return {
                title: /^\[\u5c08\u5c6c\u6559\u7df4\u8ab2\]/.test(title) ? '\u5c08\u5c6c\u6559\u7df4\u8ab2' : title || '\u672a\u77e5\u6216\u5df2\u4e0b\u67b6\u8ab2\u7a0b',
                date,
                time: String(slot?.time || booking.slotTime || '').trim()
            };
        };

        const CoachSlotsView = ({ onPaymentsChanged = () => {} }) => {
          const [form, setForm] = useState({ 
            mode: 'single', title: '\u65b0\u624b\u5718\u8ab2', location: '\u95dc\u8056\u91cc\u6d3b\u52d5\u4e2d\u5fc3', teachingCoachId: '',
            date: '', startTime: '21:00', endTime: '22:00', capacity: '1', 
            prices: { 1: '', 2: '', 3: '', 4: '', 5: '' },
            coachBase1v1: '', coachBase1v2: ''
          });
          const [allowedLocations, setAllowedLocations] = useState([...LOCATIONS_LIST]);
          const [bookings, setBookings] = useState([]);
          const [members, setMembers] = useState([]);
          const [slots, setSlots] = useState([]);
          const [supportsSingleRegistration, setSupportsSingleRegistration] = useState(false);
          const [monthlyTariffs, setMonthlyTariffs] = useState(null);
          const [teachingCoaches, setTeachingCoaches] = useState([]);
          const [supportsTeachingCoaches, setSupportsTeachingCoaches] = useState(false);
          const [dataError, setDataError] = useState('');
          const [loading, setLoading] = useState(false);
          const [logModalTarget, setLogModalTarget] = useState(null); 
          const [showMonthlyLeave, setShowMonthlyLeave] = useState(false);
          const [editingSlot, setEditingSlot] = useState(null);
          const cancellingRef = React.useRef(false);

          const addingSlotsRef = React.useRef(false);
          let coachHours = [], coachHoursError = '';
          if (form.mode === 'coach') {
            try { coachHours = splitCoachHours(form.startTime, form.endTime); }
            catch (error) { coachHoursError = error.message; }
          }
          const monthlyInfo = getMonthlyDatesInfo(form.date);
          const [tariff, setTariff] = useState(null);
          const [pricingBusy, setPricingBusy] = useState(false);
          const pricingRequest = React.useRef(0);
          useEffect(() => {
            const request = ++pricingRequest.current;
            setPricingBusy(true);
            fetchAPI({ action: 'getPricingPreview', mode: form.mode, startTime: form.startTime, endTime: form.endTime, date: form.date }).then(result => {
                if (request !== pricingRequest.current) return;
                if (result.status !== 'success') { setDataError(result.message || '\u7121\u6cd5\u8b80\u53d6\u5f8c\u7aef\u50f9\u683c\u5efa\u8b70\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002'); return; }
                if (form.mode === 'monthly' && result.monthlyUniformPricingVersion !== 1) { setTariff(null); setDataError('\u6708\u7e73\u7d71\u4e00\u50f9\u683c\u5c1a\u672a\u555f\u7528\uff0c\u8acb\u5148\u66f4\u65b0\u5f8c\u7aef\u3002'); return; }
                setTariff(result.tariff);
                setForm(prev => ({ ...prev, ...(form.mode !== 'coach' ? { prices: Object.fromEntries([1,2,3,4,5].map(level => [level, result.prices[level] ?? ''])) } : {}), coachBase1v1: prev.coachBase1v1 || String(result.coachDefaults.oneToOne), coachBase1v2: prev.coachBase1v2 || String(result.coachDefaults.oneToTwo) }));
            }).finally(() => { if (request === pricingRequest.current) setPricingBusy(false); });
            return () => { pricingRequest.current++; };
          }, [form.mode, form.startTime, form.endTime, form.date]);

          const fetchData = () => {
            return Promise.all([fetchAPI({ action: 'getCoachData' }), fetchAPI({ action: 'getSlots' })]).then(([bRes, sRes]) => {
                if (bRes.status !== 'success' || sRes.status !== 'success') throw new Error(bRes.message || sRes.message || '\u8b80\u53d6\u6392\u8ab2\u8cc7\u6599\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002');
                setDataError('');
                setTeachingCoaches(sRes.teachingCoaches || []);
                setSupportsTeachingCoaches(sRes.teachingCoachesVersion === 1);
                setBookings(bRes.bookings || []);
                setMembers(bRes.members || []);
                setSlots((sRes.slots || []).filter(s => s.id && s.title && s.date));
                setSupportsSingleRegistration(sRes.coachSingleRegistrationVersion === 1);
                setMonthlyTariffs(sRes.monthlyUniformPricingVersion === 1 ? sRes.monthlyGroupTariffs : null);
                onPaymentsChanged();
            }).catch(error => { setDataError(error.message); throw error; });
          };

          useEffect(() => { fetchData().catch(() => {}); }, []);

          const toggleLocation = (loc) => {
              setAllowedLocations(prev => prev.includes(loc) ? prev.filter(l => l !== loc) : [...prev, loc]);
          };

          const handleAddSlot = async (e) => {
            e.preventDefault();
            if (addingSlotsRef.current) return;
            if (!supportsTeachingCoaches || !teachingCoaches.some(coach => coach.id === form.teachingCoachId)) { alert('\u8acb\u5148\u65b0\u589e\u4e26\u9078\u64c7\u6388\u8ab2\u6559\u7df4\u3002'); return; }
            const accessToken = typeof liff !== 'undefined' ? liff.getAccessToken() : null;
            if (!accessToken) { alert('\u8acb\u91cd\u65b0\u767b\u5165 LINE\u3002'); return; }
            let times = [`${form.startTime} - ${form.endTime}`];
            let finalTitle = form.title, finalCapacity = form.capacity, finalLocation = form.location;
            try {
                if (form.mode === 'monthly' && (!monthlyTariffs || !tariff)) throw new Error('\u8acb\u5148\u78ba\u8a8d\u6708\u7e73\u7d71\u4e00\u50f9\u683c\u53ca\u4e0a\u8ab2\u65e5\u671f\u3002');
                if (form.mode === 'monthly') finalTitle = `[\u6708\u7e73${monthlyInfo.count}\u5802] ${form.title}`;
                else if (form.mode === 'coach') {
                    if (!allowedLocations.length) throw new Error('\u8acb\u81f3\u5c11\u9078\u64c7\u4e00\u500b\u5141\u8a31\u5b78\u751f\u9810\u7d04\u7684\u5834\u5730\uff01');
                    times = splitCoachHours(form.startTime, form.endTime);
                    if (slots.some(slot => /^\[\u5c08\u5c6c\u6559\u7df4\u8ab2\]/.test(slot.title) && doesSlotMatchDate(slot, form.date) && times.includes(slot.time) && slot.teachingCoachId === form.teachingCoachId)) throw new Error('\u6b64\u65e5\u671f\u5df2\u6709\u76f8\u540c\u7684\u6559\u7df4\u6642\u6bb5\uff0c\u8acb\u5148\u6838\u5c0d\u5df2\u958b\u8ab2\u7a0b\uff0c\u907f\u514d\u91cd\u8907\u4e0a\u67b6\u3002');
                    finalTitle = `[\u5c08\u5c6c\u6559\u7df4\u8ab2] 1v1:${form.coachBase1v1}|1v2:${form.coachBase1v2}`;
                    finalCapacity = 1;
                    finalLocation = `coach_loc:${allowedLocations.join(',')}`;
                }
            } catch (error) { alert(error.message); return; }
            addingSlotsRef.current = true; setLoading(true);
            const created = [];
            const finalDate = form.mode === 'monthly' ? `${form.date.slice(0, 4)}\u5e74 ${monthlyInfo.text}` : `${form.date} (${getDayOfWeek(form.date)})`;
            try {
                for (const time of times) {
                    const result = await fetchAPI({ action: 'addSlot', ...form, capacity: finalCapacity, location: finalLocation, title: finalTitle, date: finalDate, time, accessToken });
                    if (!result || result.status !== 'success') throw new Error((result && result.message) || '\u5f8c\u7aef\u672a\u78ba\u8a8d\u6210\u529f\uff0c\u8acb\u5148\u6838\u5c0d\u8ab2\u7a0b\u6e05\u55ae\u3002');
                    created.push(time);
                }
                setForm(prev => ({ ...prev, date: '' }));
                await fetchData();
                alert(form.mode === 'coach' ? `\u5df2\u4e0a\u67b6 ${created.length} \u500b\u7368\u7acb\u7684\u4e00\u5c0f\u6642\u6559\u7df4\u6642\u6bb5\u3002` : '\u8ab2\u7a0b\u4e0a\u67b6\u6210\u529f\uff01');
            } catch (error) {
                setForm(prev => ({ ...prev, date: '' }));
                await fetchData().catch(() => {});
                alert(`\u4e0a\u67b6\u672a\u5168\u90e8\u78ba\u8a8d\u6210\u529f\u3002\u5df2\u78ba\u8a8d ${created.length}/${times.length} \u500b\u6642\u6bb5${created.length ? '\uff1a' + created.join('\u3001') : ''}\u3002\n${error.message}\n\u8acb\u5148\u6838\u5c0d\u5df2\u958b\u8ab2\u7a0b\uff0c\u518d\u8a2d\u5b9a\u5c1a\u672a\u5efa\u7acb\u7684\u6642\u6bb5\uff0c\u52ff\u76f4\u63a5\u91cd\u8907\u4e0a\u67b6\u3002`);
            } finally { addingSlotsRef.current = false; setLoading(false); }
          };

          const updatePrice = async (level, value) => {
            const request = ++pricingRequest.current;
            setForm(prev => ({ ...prev, prices: { ...prev.prices, [level]: value } }));
            if (Number(level) !== 1 || value === '') { setPricingBusy(false); return; }
            setPricingBusy(true);
            try {
                const result = await fetchAPI({ action: 'getPricingPreview', mode: form.mode, startTime: form.startTime, endTime: form.endTime, date: form.date, basePrice: value });
                if (request !== pricingRequest.current) return;
                if (result.status !== 'success') throw new Error(result.message || '\u7121\u6cd5\u8b80\u53d6\u5f8c\u7aef\u50f9\u683c\u5efa\u8b70\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002');
                setForm(prev => ({ ...prev, prices: result.prices }));
            } catch (error) { setDataError(error.message); }
            finally { if (request === pricingRequest.current) setPricingBusy(false); }
          };

          const handleCancelBooking = async booking => {
            if (loading || cancellingRef.current || !booking.bookingId) return;
            if (!confirm(`\u78ba\u8a8d\u53d6\u6d88 ${booking.name || '\u5b78\u751f'} \u7684\u9810\u7d04\uff1f\n\u8a02\u55ae\uff1a${booking.bookingId}\n\u5c07\u4fdd\u7559\u53d6\u6d88\u7d00\u9304\u4e26\u56de\u88dc\u540d\u984d\uff0c\u4e0d\u6703\u81ea\u52d5\u9000\u6b3e\u3002`)) return;
            cancellingRef.current = true; setLoading(true);
            let saved = false;
            try {
                const accessToken = typeof liff !== 'undefined' ? liff.getAccessToken() : null;
                if (!accessToken) throw new Error('\u8acb\u91cd\u65b0\u767b\u5165 LINE\u3002');
                const result = await fetchAPI({ action: 'cancelBooking', bookingId: booking.bookingId, accessToken });
                if (!result || result.status !== 'success') throw new Error((result && result.message) || '\u8acb\u5148\u66f4\u65b0 Apps Script \u90e8\u7f72\uff0c\u652f\u63f4\u53d6\u6d88\u9810\u7d04\u3002');
                saved = true; await fetchData(); alert('\u9810\u7d04\u5df2\u53d6\u6d88\uff0c\u7d00\u9304\u4fdd\u7559\u3002\u82e5\u9700\u9000\u6b3e\u8acb\u53e6\u884c\u8655\u7406\u3002');
            } catch (err) { alert(saved ? '\u53d6\u6d88\u5df2\u9001\u51fa\uff0c\u4f46\u91cd\u65b0\u8b80\u53d6\u5931\u6557\uff0c\u8acb\u91cd\u65b0\u6574\u7406\u78ba\u8a8d\uff0c\u52ff\u91cd\u8907\u53d6\u6d88\u3002' : err.message); }
            finally { cancellingRef.current = false; setLoading(false); }
          };

          const handleDeleteSlot = async (slotId, title, dateStr) => {
            if (!confirm(`\u78ba\u5b9a\u8981\u522a\u9664\u9019\u5802\u8ab2\u55ce\uff1f\n\n${title} (${dateStr})\n\n\u26a0\ufe0f \u6b64\u64cd\u4f5c\u7121\u6cd5\u5fa9\u539f\u3002`)) return;
            setLoading(true);
            const result = await fetchAPI({ action: 'deleteSlot', slotId: slotId });
            if (result.status !== 'success') alert(result.message || '\u8ab2\u7a0b\u522a\u9664\u5931\u6557');
            fetchData().catch(() => {}); setLoading(false);
          };

          const [deletingBookingId, setDeletingBookingId] = useState(null);
          const deletingBookingRef = React.useRef(false);

          const handleDeleteBooking = async (booking) => {
            if (loading || deletingBookingRef.current || !['\u5be9\u6838\u4e2d', '\u9810\u7d04\u6210\u529f'].includes(booking.status) || !booking.bookingId) return;
            const slot = slots.find(s => s.id === booking.slotId);
            const details = [
                `\u5b78\u751f\uff1a${booking.name || '\u672a\u63d0\u4f9b'}`,
                `\u8ab2\u7a0b\uff1a${booking.slotTitle || (slot && slot.title) || '\u8ab2\u7a0b\u5df2\u4e0b\u67b6'}`,
                `\u6642\u9593\uff1a${booking.slotDate || (slot && slot.date) || ''} ${booking.slotTime || (slot && slot.time) || ''}`,
                `\u91d1\u984d\uff1aNT$ ${booking.paidPrice || 0}`,
                `\u72c0\u614b\uff1a${booking.status}`,
                `\u8a02\u55ae\u7de8\u865f\uff1a${booking.bookingId}`
            ].join('\n');
            if (!confirm(`\u78ba\u5b9a\u5f9e\u9810\u7d04\u540d\u55ae\u522a\u9664\u6b64\u8a02\u55ae\uff1f\n\n${details}\n\n\u6b64\u64cd\u4f5c\u7121\u6cd5\u5fa9\u539f\uff0c\u4e14\u4e0d\u6703\u81ea\u52d5\u9000\u6b3e\u3002`)) return;
            deletingBookingRef.current = true;
            setDeletingBookingId(booking.bookingId);
            setLoading(true);
            try {
                const accessToken = typeof liff !== 'undefined' ? liff.getAccessToken() : null;
                if (!accessToken) throw new Error('\u8acb\u91cd\u65b0\u767b\u5165 LINE \u5f8c\u518d\u522a\u9664\u8a02\u55ae\u3002');
                const result = await fetchAPI({ action: 'deleteBooking', bookingId: booking.bookingId, accessToken });
                if (!result || result.status === 'error' || result.success === false ||
                    !(result.status === 'success' || result.success === true)) {
                    throw new Error(result && result.message ? result.message : '\u522a\u9664\u672a\u7372\u5f8c\u7aef\u78ba\u8a8d\u3002\u8acb\u78ba\u8a8d Apps Script \u5df2\u66f4\u65b0\u4e26\u91cd\u65b0\u90e8\u7f72\uff0c\u652f\u63f4 deleteBooking\u3002');
                }
                const [coachData, slotData] = await Promise.all([
                    fetchAPI({ action: 'getCoachData' }),
                    fetchAPI({ action: 'getSlots' })
                ]);
                if (!Array.isArray(coachData.bookings) || !Array.isArray(slotData.slots)) {
                    throw new Error('\u522a\u9664\u5df2\u9001\u51fa\uff0c\u4f46\u7121\u6cd5\u91cd\u65b0\u8b80\u53d6\u8a02\u55ae\u8207\u540d\u984d\uff0c\u8acb\u91cd\u65b0\u6574\u7406\u78ba\u8a8d\uff0c\u52ff\u91cd\u8907\u522a\u9664\u3002');
                }
                setBookings(coachData.bookings);
                setSlots(slotData.slots.filter(s => s.id && s.title && s.date));
                if (coachData.bookings.some(b => b.bookingId === booking.bookingId)) {
                    throw new Error('\u8a02\u55ae\u4ecd\u5728\u6e05\u55ae\u4e2d\uff0c\u5c1a\u672a\u78ba\u8a8d\u522a\u9664\uff0c\u8acb\u78ba\u8a8d\u5f8c\u7aef\u8655\u7406\u7d50\u679c\u3002');
                }
                alert('\u8a02\u55ae\u5df2\u522a\u9664\uff0c\u8ab2\u7a0b\u540d\u984d\u8cc7\u6599\u5df2\u91cd\u65b0\u8b80\u53d6\u3002\u5982\u9700\u9000\u6b3e\uff0c\u8acb\u53e6\u5916\u8655\u7406\u3002');
            } catch (error) {
                alert(error.message || '\u522a\u9664\u5931\u6557\uff0c\u8acb\u91cd\u65b0\u6574\u7406\u78ba\u8a8d\u8a02\u55ae\u72c0\u614b\u3002');
            } finally {
                deletingBookingRef.current = false;
                setDeletingBookingId(null);
                setLoading(false);
            }
          };

          const handleCashReceived = async booking => {
            if (loading || !confirm(`\u78ba\u8a8d\u5df2\u6536\u5230 ${booking.name} \u7684\u73fe\u91d1\u6559\u7df4\u8cbb NT$${booking.paidPrice}\uff1f`)) return;
            setLoading(true);
            try {
                const accessToken = typeof liff !== 'undefined' ? liff.getAccessToken() : null;
                if (!accessToken) throw new Error('\u8acb\u91cd\u65b0\u767b\u5165 LINE\u3002');
                const result = await fetchAPI({ action: 'confirmCashPayment', bookingId: booking.bookingId, accessToken });
                if (!result || result.status !== 'success') throw new Error((result && result.message) || '\u8acb\u66f4\u65b0 Apps Script \u90e8\u7f72\uff0c\u652f\u63f4\u78ba\u8a8d\u73fe\u91d1\u6536\u6b3e\u3002');
                await fetchData();
            } catch (err) { alert(err.message); }
            finally { setLoading(false); }
          };

          const handleApprove = async (bookingId, cash = false) => {
            if (!confirm(cash ? '\u78ba\u8a8d\u6b64\u6559\u7df4\u6642\u6bb5\u9810\u7d04\uff1f\u5b78\u54e1\u5c07\u65bc\u73fe\u5834\u4ed8\u73fe\uff0c\u672c\u6b21\u6838\u51c6\u4e0d\u4ee3\u8868\u5df2\u6536\u6b3e\u3002' : "\u78ba\u8a8d\u5df2\u6536\u5230\u6b3e\u9805\u4e26\u6838\u51c6\u6b64\u9810\u7d04\uff1f\n\u6838\u51c6\u5f8c\u53ef\u70ba\u8a72\u5b78\u54e1\u586b\u5beb\u8a13\u7df4\u65e5\u8a8c\u7d50\u8ab2\u3002")) return;
            setLoading(true);
            const result = await fetchAPI({ action: 'approveBooking', bookingId });
            if (result.status !== 'success') alert(result.message || '\u9810\u7d04\u6838\u51c6\u5931\u6557');
            fetchData().catch(() => {});
            setLoading(false);
          };

          return (
            <div className="space-y-6 md:space-y-8">
              {dataError && <div role="alert" className="bg-red-50 text-red-800 rounded-xl p-4"><p>{dataError}</p><button type="button" onClick={() => fetchData().catch(() => {})} className="border rounded-lg px-3 py-2 mt-2">&#x91cd;&#x65b0;&#x8b80;&#x53d6;&#x8ab2;&#x7a0b;</button></div>}
              <CoachCourseCalendar slots={slots} bookings={bookings} onEdit={setEditingSlot} />
              <TeachingCoachesManager coaches={teachingCoaches} enabled={supportsTeachingCoaches} onSuccess={fetchData} />
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <CoachGroupRegistration kind="single" members={members} slots={slots} onSuccess={fetchData} enabled={supportsSingleRegistration} />
                <CoachGroupRegistration kind="monthly" members={members} slots={slots} onSuccess={fetchData} enabled={!!monthlyTariffs} />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="font-bold text-amber-950">&#x6708;&#x7e73;&#x8acb;&#x5047;&#x8207;&#x88dc;&#x8ab2;</h2><p className="text-sm text-amber-900">&#x63d0;&#x524d;&#x81f3;&#x5c11; 14 &#x5929;&#x767b;&#x8a18;&#x8acb;&#x5047;&#xff0c;&#x518d;&#x5b89;&#x6392;&#x5176;&#x4ed6;&#x88dc;&#x8ab2;&#x65e5;&#x671f;&#x3002;</p></div>
                <button onClick={() => setShowMonthlyLeave(true)} className="bg-amber-600 text-white px-4 py-3 rounded-lg font-bold">&#x8acb;&#x5047;&#x767b;&#x8a18;&#xff0f;&#x5b89;&#x6392;&#x88dc;&#x8ab2;</button>
              </div>
              <div className="coach-workspace grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                <div className="coach-editor bg-white p-5 md:p-8 rounded-2xl shadow-sm border min-w-0 col-span-1 h-fit">
                  <h2 className="font-bold text-lg md:text-xl mb-5 border-b pb-3">&#x65b0;&#x589e;&#x8ab2;&#x7a0b; / &#x958b;&#x653e;&#x6642;&#x6bb5;</h2>
                  <form onSubmit={handleAddSlot} className="space-y-4">
                    <TeachingCoachSelect coaches={teachingCoaches} value={form.teachingCoachId} onChange={teachingCoachId => setForm(prev => ({ ...prev, teachingCoachId }))} disabled={loading || !supportsTeachingCoaches} />
                    {!supportsTeachingCoaches ? <p className="text-sm text-amber-900">&#x6388;&#x8ab2;&#x6559;&#x7df4;&#x529f;&#x80fd;&#x5c1a;&#x672a;&#x555f;&#x7528;&#xff0c;&#x8acb;&#x806f;&#x7d61;&#x7ba1;&#x7406;&#x54e1;&#x66f4;&#x65b0;&#x7cfb;&#x7d71;&#x3002;</p> : !teachingCoaches.length && <p className="text-sm text-slate-500">&#x8acb;&#x5148;&#x5728;&#x6388;&#x8ab2;&#x6559;&#x7df4;&#x7ba1;&#x7406;&#x65b0;&#x589e;&#x6559;&#x7df4;&#x3002;</p>}
                    <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                        <label className="block text-sm mb-3 font-bold text-emerald-800">&#x4e0a;&#x67b6;&#x985e;&#x578b;</label>
                        <div className="flex flex-col gap-2">
                            <label className="flex items-center text-base md:text-sm cursor-pointer hover:bg-emerald-100 p-1 rounded transition">
                                <input type="radio" name="mode" className="mr-3 md:mr-2 w-4 h-4" checked={form.mode === 'single'} onChange={() => setForm({...form, mode: 'single'})} /> &#x55ae;&#x5802;&#x5718;&#x8ab2;
                            </label>
                            <label className="flex items-center text-base md:text-sm cursor-pointer hover:bg-emerald-100 p-1 rounded transition">
                                <input type="radio" name="mode" className="mr-3 md:mr-2 w-4 h-4" checked={form.mode === 'monthly'} onChange={() => setForm({...form, mode: 'monthly'})} /> &#x6708;&#x7e73;&#x5718;&#x8ab2;
                            </label>
                            <label className="flex items-center text-base md:text-sm cursor-pointer hover:bg-emerald-100 p-1 rounded transition">
                                <input type="radio" name="mode" className="mr-3 md:mr-2 w-4 h-4" checked={form.mode === 'coach'} onChange={() => setForm({...form, mode: 'coach'})} /> &#x6559;&#x7df4;&#x6642;&#x6bb5;
                            </label>
                        </div>
                    </div>

                    {form.mode !== 'coach' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm mb-1.5 text-gray-700 font-bold">&#x8ab2;&#x7a0b;&#x540d;&#x7a31;</label>
                                <select className="w-full border border-gray-300 p-3 rounded-lg bg-white outline-none text-base" value={form.title} onChange={e=>setForm({...form, title: e.target.value})}>
                                    <option value="&#x65b0;&#x624b;&#x5718;&#x8ab2;">&#x65b0;&#x624b;&#x5718;&#x8ab2;</option>
                                    <option value="&#x521d;&#x968e;&#x5718;&#x8ab2;">&#x521d;&#x968e;&#x5718;&#x8ab2;</option>
                                    <option value="&#x521d;&#x968e;&#x5718;&#x8ab2;">&#x521d;&#x4e2d;&#x968e;&#x5718;&#x8ab2;</option>
                                    <option value="&#x5152;&#x7ae5;&#x5718;&#x8ab2;">&#x5152;&#x7ae5;&#x5718;&#x8ab2;</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm mb-1.5 text-gray-700 font-bold">&#x5730;&#x9ede;</label>
                                <select className="w-full border border-gray-300 p-3 rounded-lg bg-white outline-none text-base" value={form.location} onChange={e=>setForm({...form, location: e.target.value})}>
                                    <option value="&#x95dc;&#x8056;&#x91cc;&#x6d3b;&#x52d5;&#x4e2d;&#x5fc3;">&#x95dc;&#x8056;&#x91cc;&#x6d3b;&#x52d5;&#x4e2d;&#x5fc3;</option>
                                    <option value="&#x6c38;&#x5eb7;&#x5609;&#x4e16;">&#x6c38;&#x5eb7;&#x5609;&#x4e16;</option>
                                    <option value="&#x4ec1;&#x5fb7;&#x7fbd;&#x6f6e;">&#x4ec1;&#x5fb7;&#x7fbd;&#x6f6e;</option>
                                    <option value="&#x5357;&#x5340;&#x7fbd;&#x6f6e;">&#x5357;&#x5340;&#x7fbd;&#x6f6e;</option>
                                </select>
                            </div>
                        </div>
                    )}
                    
                    <div>
                        <label className="block text-sm mb-1.5 text-gray-700 font-bold">{form.mode === 'monthly' ? '\u9078\u64c7\u7576\u6708\u4efb\u4e00\u4e0a\u8ab2\u65e5' : '\u958b\u653e\u65e5\u671f'}</label>
                        <input type="date" required className="w-full border border-gray-300 p-3 rounded-lg text-base" value={form.date} onChange={e=>setForm({...form, date: e.target.value})} />
                        {form.mode === 'monthly' && form.date && <div className="mt-2 text-sm text-emerald-600 bg-emerald-50 p-2.5 rounded font-bold">&#x5c07;&#x81ea;&#x52d5;&#x5efa;&#x7acb;&#xff1a;{monthlyInfo.text} (&#x5171; {monthlyInfo.count} &#x5802;)</div>}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                        <div className="flex-1 min-w-0">
                            <label className="block text-sm mb-1.5 text-gray-700 font-bold">&#x958b;&#x59cb;&#x6642;&#x9593;</label>
                            <select className="w-full border border-gray-300 p-3 rounded-lg bg-white text-base" value={form.startTime} onChange={e=>setForm({...form, startTime: e.target.value})}>
                                {timeOptions.map(t => <option key={`start-${t}`} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <span className="pt-6 text-gray-400 font-bold">&#x81f3;</span>
                        <div className="flex-1 min-w-0">
                            <label className="block text-sm mb-1.5 text-gray-700 font-bold">&#x7d50;&#x675f;&#x6642;&#x9593;</label>
                            <select className="w-full border border-gray-300 p-3 rounded-lg bg-white text-base" value={form.endTime} onChange={e=>setForm({...form, endTime: e.target.value})}>
                                {timeOptions.map(t => <option key={`end-${t}`} value={t}>{t}</option>)}
                            </select>
                        </div>
                    </div>

                    {form.mode !== 'coach' ? (
                        <div className="space-y-4">
                            <div><label className="block text-sm mb-1.5 text-gray-700 font-bold">&#x7e3d;&#x540d;&#x984d;</label><input type="number" required min="1" className="w-full border border-gray-300 p-3 rounded-lg text-base" value={form.capacity} onChange={e=>setForm({...form, capacity: e.target.value})} /></div>
                            {form.mode === 'monthly' ? <><MonthlyTariffSummary tariffs={monthlyTariffs} />{tariff ? <p className="text-sm text-emerald-800">&#x672c;&#x65b9;&#x6848;&#x5171; {tariff.count} &#x5802;&#xff0c;&#x539f;&#x50f9; NT$ {tariff.regular}&#xff0c;&#x512a;&#x60e0;&#x50f9; NT$ {tariff.price}&#x3002;</p> : <p className="text-sm text-amber-800">&#x8acb;&#x9078;&#x64c7;&#x4e00;&#xff0f;&#x4e8c;&#x5c0f;&#x6642;&#x53ca;&#x542b;&#x56db;&#xff0f;&#x4e94;&#x5802;&#x7684;&#x6708;&#x7e73;&#x65e5;&#x671f;&#x3002;</p>}</> : form.mode === 'single' && tariff ? <p className="text-sm bg-blue-50 text-blue-900 rounded-lg p-3">&#x55ae;&#x5802;&#x5718;&#x8ab2;&#x539f;&#x50f9; NT$ {tariff.price}&#x3002;&#x5b78;&#x54e1;&#x512a;&#x60e0;&#x50f9;&#x8acb;&#x81f3;&#x300c;&#x5b78;&#x54e1;&#x540d;&#x55ae;&#x8207;&#x8cc7;&#x6599; &#x2192; &#x5718;&#x8ab2;&#x50f9;&#x683c;&#x300d;&#x8a2d;&#x5b9a;&#xff1b;&#x672a;&#x8a2d;&#x5b9a;&#x4f7f;&#x7528;&#x539f;&#x50f9;&#x3002;</p> : (
                            <div className="bg-gray-50 p-4 rounded-xl border space-y-3 mt-4">
                              <h3 className="text-sm font-bold text-gray-700 border-b pb-2">&#x5404;&#x7b49;&#x7d1a;&#x6536;&#x8cbb; (NT$)</h3>
                              <p className="text-sm text-amber-800">&#x5176;&#x4ed6;&#x55ae;&#x5802;&#x6642;&#x9577;&#x8acb;&#x586b;&#x5beb;&#x5404;&#x7b49;&#x7d1a;&#x6536;&#x8cbb;&#x3002;</p>
                              {[1,2,3,4,5].map(lvl => (
                                <div key={lvl} className="flex items-center text-base md:text-sm">
                                    <span className="w-16 shrink-0 font-bold text-gray-600">{LEVEL_NAMES[lvl]}</span>
                                    <input type="number" required min="0" className="flex-1 min-w-0 border border-gray-300 p-2 rounded-lg px-3" value={form.prices[lvl]} onChange={e=>updatePrice(lvl, e.target.value)} />
                                </div>
                              ))}
                            </div>
                            )}
                        </div>
                    ) : (
                        <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 space-y-4 mt-4">
                            <h3 className="text-sm font-bold text-indigo-800 border-b border-indigo-200 pb-2">&#x5c08;&#x5c6c;&#x6559;&#x7df4;&#x8ab2;&#x6536;&#x8cbb;&#x8a2d;&#x5b9a; (&#x57fa;&#x6e96;&#x50f9;)</h3>
                            <div className="flex items-center text-base md:text-sm gap-3"><span className="w-20 shrink-0 font-bold text-indigo-900">1&#x5c0d;1 &#x6bcf;&#x5c0f;&#x6642;</span><input type="number" required min="0" className="flex-1 min-w-0 border border-indigo-200 p-2 rounded-lg px-3 text-base" value={form.coachBase1v1} onChange={e=>setForm({...form, coachBase1v1: e.target.value})} /></div>
                            <div className="flex items-center text-base md:text-sm gap-3"><span className="w-20 shrink-0 font-bold text-indigo-900">1&#x5c0d;2 &#x6bcf;&#x5c0f;&#x6642;</span><input type="number" required min="0" className="flex-1 min-w-0 border border-indigo-200 p-2 rounded-lg px-3 text-base" value={form.coachBase1v2} onChange={e=>setForm({...form, coachBase1v2: e.target.value})} /></div>
                            
                            <h3 className="text-sm font-bold text-indigo-800 border-b border-indigo-200 pb-2 mt-4">&#x958b;&#x653e;&#x5b78;&#x54e1;&#x53ef;&#x9078;&#x5834;&#x5730;</h3>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {LOCATIONS_LIST.map(loc => (
                                    <label key={loc} className="flex items-center gap-1.5 text-sm cursor-pointer bg-white px-2 py-1.5 rounded border border-indigo-200 shadow-sm transition hover:bg-indigo-100">
                                        <input type="checkbox" checked={allowedLocations.includes(loc)} onChange={() => toggleLocation(loc)} className="accent-indigo-600 w-4 h-4" />
                                        <span className="text-indigo-900 font-medium">{loc === '\u81ea\u7406\u5834\u5730(\u9700\u79c1\u8a0a\u78ba\u8a8d)' ? '\u5176\u4ed6\u5834\u5730' : loc}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                    {form.mode === 'coach' && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mt-4 text-sm">
                        <p className="font-bold">&#x6bcf;&#x5c0f;&#x6642;&#x81ea;&#x52d5;&#x5206;&#x5272;&#xff0c;&#x7368;&#x7acb;&#x9810;&#x7d04;</p>
                        {coachHoursError ? <p role="alert" className="text-red-700 mt-2">{coachHoursError}</p> : <><p className="mt-2">&#x5c07;&#x5efa;&#x7acb; {coachHours.length} &#x500b;&#x6642;&#x6bb5;&#xff0c;&#x6bcf;&#x6bb5; 1 &#x5c0f;&#x6642;&#x3001;&#x5404; 1 &#x500b;&#x540d;&#x984d;&#x3002;&#x4ee5;&#x4e0a;&#x50f9;&#x683c;&#x70ba;&#x6bcf;&#x5c0f;&#x6642;&#x6559;&#x7df4;&#x8cbb;&#xff0c;&#x4e0d;&#x542b;&#x5834;&#x5730;&#x8cbb;&#xff0c;&#x5b78;&#x54e1;&#x9808;&#x81ea;&#x884c;&#x9810;&#x7d04;&#x5834;&#x5730;&#x3002;</p><ul className="mt-2 space-y-1">{coachHours.map(time => <li key={time}>{time}</li>)}</ul></>}
                    </div>}
                    <button type="submit" disabled={loading || pricingBusy || (form.mode === 'monthly' && (!monthlyTariffs || !tariff)) || !supportsTeachingCoaches || !teachingCoaches.some(coach => coach.id === form.teachingCoachId) || (form.mode === 'coach' && !!coachHoursError)} className="w-full bg-slate-800 text-white p-4 rounded-lg font-bold text-lg mt-6 active:scale-[0.98] transition">&#x4e0a;&#x67b6;&#x6642;&#x6bb5;</button>
                  </form>
                </div>

                <div className="coach-results min-w-0 col-span-1 md:col-span-2 space-y-6 md:space-y-8">
                    <div className="bg-white p-4 md:p-8 rounded-2xl shadow-sm border w-full overflow-hidden">
                        <div className="flex justify-between items-center mb-5 border-b pb-3">
                            <h2 className="font-bold text-lg md:text-xl text-emerald-700">&#x5df2;&#x958b;&#x8ab2;&#x7a0b;&#x8207;&#x6642;&#x6bb5;</h2>
                            <span className="text-sm font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">&#x5171; {slots.length} &#x5802;</span>
                        </div>
                        <div className="mobile-list-wrap overflow-x-auto max-h-[400px] overflow-y-auto">
                          <table className="mobile-card-table w-full min-w-max text-left text-sm md:text-base whitespace-nowrap">
                            <thead className="sticky top-0 bg-white shadow-sm z-10"><tr className="text-gray-600"><th className="p-3 md:p-4">&#x8ab2;&#x7a0b;&#x540d;&#x7a31;</th><th className="p-3 md:p-4">&#x65e5;&#x671f;/&#x6642;&#x9593;</th><th className="p-3 md:p-4 text-center">&#x9032;&#x5ea6;</th><th className="p-3 md:p-4 text-center">&#x64cd;&#x4f5c;</th></tr></thead>
                            <tbody>
                              {slots.map((s, idx) => {
                                const booked = s.capacity - s.remaining;
                                const isFull = booked >= s.capacity;
                                const safeLocation = s.location || '';
                                const isCoach = s.title.startsWith('[\u5c08\u5c6c\u6559\u7df4\u8ab2]');
                                const displayLoc = safeLocation.startsWith('coach_loc:') ? '\u5b78\u54e1\u81ea\u9078\u5834\u5730' : safeLocation;
                                return (
                                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                                    <td data-label="&#x8ab2;&#x7a0b;&#x540d;&#x7a31;" className="p-3 md:p-4"><span className="font-bold text-gray-800">{isCoach ? '\u6559\u7df4\u958b\u653e\u6642\u6bb5' : s.title}</span><span className="block text-xs text-slate-500 mt-1 whitespace-normal break-words">&#x6388;&#x8ab2;&#x6559;&#x7df4;&#xff1a;{s.teachingCoachName || '\u672a\u6307\u5b9a'}</span></td>
                                    <td data-label="&#x65e5;&#x671f;/&#x6642;&#x9593;" className="p-3 md:p-4 text-gray-500">{s.date} <br/><span className="text-xs md:text-sm">{s.time} &#x2022; {displayLoc}</span></td>
                                    <td data-label="&#x9032;&#x5ea6;" className="p-3 md:p-4 text-center"><span className={`px-3 py-1 rounded-full font-bold text-xs md:text-sm ${isFull ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'}`}>{booked}/{s.capacity}</span></td>
                                    <td data-label="&#x64cd;&#x4f5c;" className="p-3 md:p-4 text-center"><div className="flex flex-wrap justify-center gap-2"><button onClick={() => setEditingSlot(s)} className="bg-blue-50 text-blue-700 font-bold px-4 py-2 rounded-lg">&#x7de8;&#x8f2f;</button><button onClick={() => handleDeleteSlot(s.id, s.title, s.date)} className="text-red-600 hover:text-red-800 font-bold text-sm bg-red-50 hover:bg-red-100 px-4 py-2 rounded-lg active:scale-95 transition">&#x522a;&#x9664;</button></div></td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                    </div>

                    <div className="coach-booking-list bg-white p-4 md:p-8 rounded-2xl shadow-sm border w-full overflow-hidden">
                      <h2 className="font-bold text-lg md:text-xl mb-5 border-b pb-3 text-slate-800">&#x6700;&#x65b0;&#x9810;&#x7d04;&#x540d;&#x55ae; (&#x6559;&#x7df4;&#x5c0d;&#x5e33;&#x8207;&#x7d50;&#x8ab2;)</h2>
                      <div className="mobile-list-wrap overflow-x-auto max-h-[400px] overflow-y-auto">
                        <table className="mobile-card-table w-full min-w-max text-left text-sm md:text-base whitespace-nowrap">
                          <thead className="sticky top-0 bg-white shadow-sm z-10"><tr className="text-gray-600">
                              <th className="p-3 md:p-4">&#x5b78;&#x751f;&#x59d3;&#x540d;</th>
                              <th className="p-3 md:p-4">&#x9810;&#x7d04;&#x8ab2;&#x7a0b;&#xff0f;&#x65e5;&#x671f;&#x6642;&#x6bb5;</th>
                              <th className="p-3 md:p-4">&#x91d1;&#x984d;</th>
                              <th className="p-3 md:p-4">&#x72c0;&#x614b; / &#x5f8c;&#x4e94;&#x78bc;</th>
                              <th className="p-3 md:p-4 text-center">&#x64cd;&#x4f5c;</th>
                          </tr></thead>
                          <tbody>
                            {bookings.slice().reverse().map((b, idx) => {
                               const course = coachBookingCourseInfo(b, slots);
                               return (
                              <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                                <td data-label="&#x5b78;&#x751f;&#x59d3;&#x540d;" className="p-3 md:p-4 font-bold text-gray-800">{b.name}{b.makeupLeaveId && <span className="block text-xs font-normal text-emerald-700 mt-1">&#x6708;&#x7e73;&#x88dc;&#x8ab2;&#xff08;&#x4e0d;&#x91cd;&#x8907;&#x6536;&#x8cbb;&#xff09;</span>}</td>
                                <td data-label="&#x9810;&#x7d04;&#x8ab2;&#x7a0b;&#xff0f;&#x65e5;&#x671f;&#x6642;&#x6bb5;" className="p-3 md:p-4 max-w-sm whitespace-normal break-words"><p className="font-bold text-slate-800">{course.title}</p><p className="text-sm text-slate-600 mt-1">&#x4e0a;&#x8ab2;&#x65e5;&#x671f;&#xff1a;{course.date || '\u65e5\u671f\u672a\u63d0\u4f9b'}</p><p className="text-sm text-slate-600 mt-1">&#x4e0a;&#x8ab2;&#x6642;&#x6bb5;&#xff1a;{course.time || '\u6642\u6bb5\u672a\u63d0\u4f9b'}</p></td>
                                <td data-label="&#x91d1;&#x984d;" className="p-3 md:p-4 text-emerald-600 font-bold">NT$ {b.paidPrice}{['\u73fe\u5834\u73fe\u91d1','\u73fe\u91d1\u5df2\u6536'].includes(b.paymentCode) && <p className="text-xs text-amber-900 mt-1">{b.paymentCode === '\u73fe\u91d1\u5df2\u6536' ? '\u73fe\u91d1\u5df2\u6536\u6b3e' : '\u73fe\u5834\u4ed8\u73fe \u00b7 \u5c1a\u672a\u78ba\u8a8d\u6536\u6b3e'}</p>}</td>
                                <td data-label="&#x72c0;&#x614b; / &#x5f8c;&#x4e94;&#x78bc;" className="p-3 md:p-4">
                                    {b.status === "\u5df2\u53d6\u6d88" ? <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-md">&#x5df2;&#x53d6;&#x6d88;</span> : b.status === "\u5df2\u5b8c\u8ab2" ? (
                                        <span className="text-gray-500 font-bold text-sm bg-gray-100 px-2 py-1 rounded-md">&#x1f3c1; &#x5df2;&#x5b8c;&#x8ab2;&#x7d50;&#x55ae;</span>
                                    ) : b.status === "\u9810\u7d04\u6210\u529f" ? (
                                        <span className="text-emerald-600 font-bold text-sm bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-md">&#x2705; &#x9810;&#x7d04;&#x6210;&#x529f;</span>
                                    ) : (
                                        <div className="flex flex-col gap-1 w-fit">
                                            <span className="text-amber-600 font-bold text-sm animate-pulse">&#x23f3; &#x5be9;&#x6838;&#x4e2d;</span>
                                            <span className="text-xs text-gray-500 font-mono bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
                                              {b.paymentCode === '\u73fe\u5834\u73fe\u91d1' ? '\u73fe\u5834\u73fe\u91d1\uff08\u5c1a\u672a\u6536\u6b3e\uff09' : b.paymentCode === '\u73fe\u91d1\u5df2\u6536' ? '\u73fe\u91d1\u5df2\u6536\u6b3e' : `\u672b\u4e94\u78bc: ${b.paymentCode || '\u672a\u586b\u5beb'}`}
                                            </span>
                                        </div>
                                    )}
                                </td>
                                <td data-label="&#x64cd;&#x4f5c;" className="p-3 md:p-4 text-center">
                                    <div className="flex flex-wrap justify-center gap-2">
                                        {b.paymentCode === '\u73fe\u5834\u73fe\u91d1' && ['\u9810\u7d04\u6210\u529f', '\u5df2\u5b8c\u8ab2'].includes(b.status) && b.bookingId && <button onClick={() => handleCashReceived(b)} disabled={loading} className="bg-amber-600 text-white font-bold py-2 px-3 rounded-lg disabled:opacity-50">&#x78ba;&#x8a8d;&#x73fe;&#x91d1;&#x6536;&#x6b3e;</button>}
                                        {b.status === "\u5be9\u6838\u4e2d" && b.bookingId && (
                                            <button onClick={() => handleApprove(b.bookingId, b.paymentCode === '\u73fe\u5834\u73fe\u91d1')} disabled={loading} className="bg-amber-500 hover:bg-amber-600 text-white font-bold py-1.5 px-3 rounded-lg shadow-sm text-sm active:scale-95 transition disabled:opacity-50">
                                                {b.paymentCode === '\u73fe\u5834\u73fe\u91d1' ? '\u78ba\u8a8d\u9810\u7d04\uff08\u73fe\u5834\u4ed8\u73fe\uff09' : '\u5c0d\u5e33\u6838\u51c6'}
                                            </button>
                                        )}
                                        {b.status === "\u9810\u7d04\u6210\u529f" && b.bookingId && (
                                            <button onClick={() => setLogModalTarget({ lineId: b.lineId, studentId: b.studentId, name: b.name, bookingId: b.bookingId })} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-lg shadow-sm text-sm active:scale-95 transition disabled:opacity-50">
                                                &#x7d50;&#x8ab2; / &#x65e5;&#x8a8c;
                                            </button>
                                        )}
                                        {["\u5be9\u6838\u4e2d", "\u9810\u7d04\u6210\u529f"].includes(b.status) && <button onClick={() => handleCancelBooking(b)} disabled={loading || !b.bookingId} className="bg-orange-50 text-orange-800 border border-orange-200 font-bold py-2 px-3 rounded-lg disabled:opacity-50">&#x53d6;&#x6d88;&#x9810;&#x7d04;</button>}
                                        {["\u5be9\u6838\u4e2d", "\u9810\u7d04\u6210\u529f"].includes(b.status) && (
                                            <button onClick={() => handleDeleteBooking(b)} disabled={loading || !b.bookingId} title={!b.bookingId ? '\u6b64\u820a\u8a02\u55ae\u7f3a\u5c11\u8a02\u55ae\u7de8\u865f\uff0c\u8acb\u5148\u88dc\u4e0a\u9810\u7d04\u540d\u55ae\u7b2c H \u6b04\u7684\u552f\u4e00\u7de8\u865f\u3002' : undefined} aria-label={`\u522a\u9664${b.name || '\u5b78\u54e1'}\u7684\u9810\u7d04`} className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold py-1.5 px-3 rounded-lg shadow-sm text-sm active:scale-95 transition disabled:opacity-50">
                                                {deletingBookingId === b.bookingId ? '\u522a\u9664\u4e2d...' : '\u522a\u9664\u8a02\u55ae'}
                                            </button>
                                        )}
                                        {b.status === "\u5df2\u53d6\u6d88" && <span className="text-xs text-gray-500">&#x53d6;&#x6d88;&#x7d00;&#x9304;&#x4fdd;&#x7559;</span>}
                                        {b.status === "\u5df2\u5b8c\u8ab2" && <span className="text-xs text-gray-400 font-bold">&#x5df2;&#x5b8c;&#x8ab2;&#x7d00;&#x9304;&#x4fdd;&#x7559;</span>}
                                    </div>
                                    {["\u5be9\u6838\u4e2d", "\u9810\u7d04\u6210\u529f"].includes(b.status) && !b.bookingId && (
                                        <p className="mt-2 text-xs text-red-600">&#x7f3a;&#x5c11;&#x8a02;&#x55ae;&#x7de8;&#x865f;&#xff0c;&#x8acb;&#x5148;&#x88dc;&#x4e0a;&#x552f;&#x4e00;&#x7de8;&#x865f;</p>
                                    )}
                                </td>
                              </tr>
                            )})}
                          </tbody>
                        </table>
                      </div>
                    </div>
                </div>
              </div>
              {editingSlot && <EditSlotModal slot={editingSlot} monthlyTariffs={monthlyTariffs} teachingCoaches={teachingCoaches} supportsTeachingCoaches={supportsTeachingCoaches} onClose={() => setEditingSlot(null)} onSuccess={fetchData} />}
              {showMonthlyLeave && <MonthlyLeaveModal bookings={bookings} slots={slots} onClose={() => setShowMonthlyLeave(false)} onSuccess={fetchData} />}
              {/* \u5171\u7528\u5beb\u65e5\u8a8c\u5f48\u7a97 (\u50b3\u5165 targetData={lineId, name, bookingId}) */}
              {logModalTarget && <LogFormModal targetData={logModalTarget} onClose={() => setLogModalTarget(null)} onSuccess={() => fetchData().catch(() => {})} />}
            </div>
          );
        };

        const StudentGroupPriceModal = ({ student, originals, onClose, onSaved }) => {
            const [prices, setPrices] = useState({ hour1: student.groupPrices?.hour1 ?? '', hour2: student.groupPrices?.hour2 ?? '' });
            const [busy, setBusy] = useState(false);
            const [error, setError] = useState('');
            const busyRef = React.useRef(false);
            const submit = async event => {
                event.preventDefault();
                if (busyRef.current) return;
                busyRef.current = true; setBusy(true); setError('');
                try {
                    const result = await fetchAPI({ action: 'setStudentGroupPrices', lineId: student.lineId, studentId: student.studentId || '', groupPrices: prices });
                    if (result.status !== 'success' || result.studentGroupPricingVersion !== 1) throw new Error(result.message || '\u5b78\u54e1\u5718\u8ab2\u50f9\u683c\u5132\u5b58\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002');
                    await onSaved(); onClose();
                } catch (error) { setError(error.message); }
                finally { busyRef.current = false; setBusy(false); }
            };
            return <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 md:p-6 overflow-y-auto">
                <section role="dialog" aria-modal="true" aria-labelledby="student-group-prices-title" className="bg-white rounded-2xl p-5 md:p-7 shadow-xl w-full max-w-lg max-h-[90dvh] overflow-y-auto min-w-0">
                    <h2 id="student-group-prices-title" className="font-bold text-lg text-slate-800">&#x5718;&#x8ab2;&#x50f9;&#x683c;&#x8a2d;&#x5b9a;&#xff1a;{student.name}</h2>
                    <p className="text-sm text-gray-600 mt-3">&#x50c5;&#x5957;&#x7528;&#x6b64;&#x5b78;&#x54e1;&#x7684;&#x55ae;&#x5802;&#x5718;&#x8ab2;&#x3002;&#x7559;&#x7a7a;&#x4f7f;&#x7528;&#x539f;&#x50f9;&#xff0c;&#x586b;&#x5beb; 0 &#x8868;&#x793a;&#x514d;&#x8cbb;&#xff1b;&#x6708;&#x7e73;&#x8207;&#x5c08;&#x5c6c;&#x6559;&#x7df4;&#x8ab2;&#x7dad;&#x6301;&#x539f;&#x65b9;&#x6848;&#xff0c;&#x5df2;&#x6210;&#x7acb;&#x8a02;&#x55ae;&#x4e0d;&#x8b8a;&#x3002;</p>
                    <form onSubmit={submit} className="space-y-5 mt-5">
                        {[['hour1', '\u4e00\u5c0f\u6642\u5718\u8ab2\u512a\u60e0\u50f9'], ['hour2', '\u4e8c\u5c0f\u6642\u5718\u8ab2\u512a\u60e0\u50f9']].map(([key, label]) => <label key={key} className="block font-bold text-slate-700">{label}<span className="block font-normal text-sm text-gray-500 mt-1">&#x539f;&#x50f9; NT$ {originals[key]}</span><input aria-label={label} type="number" min="0" step="0.01" value={prices[key]} disabled={busy} onChange={event => setPrices(previous => ({ ...previous, [key]: event.target.value }))} className="block border rounded-lg p-3 mt-2 w-full min-w-0" placeholder="&#x7559;&#x7a7a;&#x4f7f;&#x7528;&#x539f;&#x50f9;" /></label>)}
                        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
                        <div className="flex flex-wrap justify-end gap-3"><button type="button" disabled={busy} onClick={onClose} className="border rounded-lg px-4 py-3">&#x53d6;&#x6d88;</button><button type="submit" disabled={busy} className="bg-blue-700 text-white font-bold rounded-lg px-4 py-3 disabled:opacity-50">{busy ? '\u5132\u5b58\u4e2d...' : '\u5132\u5b58\u5718\u8ab2\u50f9\u683c'}</button></div>
                    </form>
                </section>
            </div>;
        };

        const CoachMembersView = ({ onOpenStudent, onPaymentsChanged = () => {} }) => {
            const [members, setMembers] = useState([]);
            const [paymentTotals, setPaymentTotals] = useState(null);
            const [paymentError, setPaymentError] = useState('');
            const [historicalStudent, setHistoricalStudent] = useState(null);
            const [pricingStudent, setPricingStudent] = useState(null);
            const [pricingDefaults, setPricingDefaults] = useState(null);
            const [viewModal, setViewModal] = useState({ isOpen: false, student: null });
            const [logModalTarget, setLogModalTarget] = useState(null); 

            const fetchMembers = () => {
                return fetchAPI({ action: 'getCoachData' }).then(res => {
                    setMembers(res.members || []);
                    setPricingDefaults(res.studentGroupPricingVersion === 1 ? res.groupPriceDefaults : null);
                    if (res.status !== 'error' && Array.isArray(res.bookings)) {
                        const totals = res.paymentSummary;
                        if (!totals || !Array.isArray(totals.studentTotals)) { setPaymentTotals(null); setPaymentError('\u7121\u6cd5\u8b80\u53d6\u4ed8\u6b3e\u8cc7\u6599\uff0c\u7d2f\u7a4d\u91d1\u984d\u66ab\u4e0d\u986f\u793a\u3002'); return res; }
                        setPaymentTotals(new Map(totals.studentTotals));
                        setPaymentError([
                            totals.invalidAmounts || totals.duplicateOrders ? '\u4ed8\u6b3e\u8cc7\u6599\u5b58\u5728\u7570\u5e38\u6216\u7f3a\u6f0f\uff0c\u8acb\u53c3\u95b1\u6536\u5165\u7d71\u8a08\u4e26\u6838\u5c0d\u539f\u8a02\u55ae\u3002' : '',
                            totals.unmatchedStudents ? '\u90e8\u5206\u8a02\u55ae\u7121\u6cd5\u5c0d\u61c9\u500b\u5225\u5b78\u54e1\uff0c\u672a\u5217\u5165\u500b\u4eba\u7d2f\u7a4d\u91d1\u984d\uff1b\u8acb\u6838\u5c0d\u539f\u8a02\u55ae\u7684\u5b78\u54e1\u7de8\u865f\u3002' : ''
                        ].filter(Boolean).join(' '));
                    } else { setPaymentTotals(null); setPaymentError('\u7121\u6cd5\u8b80\u53d6\u4ed8\u6b3e\u8cc7\u6599\uff0c\u7d2f\u7a4d\u91d1\u984d\u66ab\u4e0d\u986f\u793a\u3002'); }
                    return res;
                });
            };

            useEffect(() => { fetchMembers(); }, []);

            return (
                <div className="bg-white p-4 md:p-8 rounded-2xl shadow-sm border w-full overflow-hidden">
                    <h2 className="font-bold text-lg md:text-xl mb-5 border-b pb-3 text-slate-800">&#x5b78;&#x54e1;&#x540d;&#x55ae;&#x7e3d;&#x89bd;</h2>
                    <p className="text-sm text-gray-600 mb-4">&#x7d2f;&#x7a4d;&#x4ed8;&#x6b3e;&#x91d1;&#x984d;&#x4f9d;&#x5e33;&#x865f;&#x53ca;&#x5b78;&#x54e1;&#x7de8;&#x865f;&#x5206;&#x5225;&#x52a0;&#x7e3d;&#x5df2;&#x6838;&#x51c6;&#x53ca;&#x5df2;&#x5b8c;&#x8ab2;&#x7684;&#x73fe;&#x5b58;&#x8a02;&#x55ae;&#xff1b;&#x540c;&#x5e33;&#x865f;&#x5b78;&#x54e1;&#x4e0d;&#x5408;&#x4f75;&#xff0c;&#x672a;&#x6838;&#x51c6;&#x3001;&#x5df2;&#x53d6;&#x6d88;&#x3001;&#x5c1a;&#x672a;&#x78ba;&#x8a8d;&#x73fe;&#x91d1;&#x6536;&#x6b3e;&#x4e0d;&#x8a08;&#x3002;</p>
                    {paymentError && <p role="status" className="text-sm text-amber-800 mb-4">{paymentError}</p>}
                    <div className="mobile-list-wrap overflow-x-auto">
                        <table className="mobile-card-table w-full min-w-max text-left text-sm md:text-base whitespace-nowrap">
                            <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                                <tr>
                                    <th className="p-3 md:p-4">&#x5b78;&#x54e1;&#x59d3;&#x540d;</th>
                                    <th className="p-3 md:p-4">&#x6703;&#x54e1;&#x7b49;&#x7d1a;</th>
                                    <th className="p-3 md:p-4 text-center">&#x7d2f;&#x8a08;&#x5b8c;&#x6210;&#x5802;&#x6578;</th>
                                    <th className="p-3 md:p-4">&#x7d2f;&#x7a4d;&#x4ed8;&#x6b3e;&#x91d1;&#x984d;</th>
                                    <th className="p-3 md:p-4 text-center">&#x64cd;&#x4f5c;</th>
                                </tr>
                            </thead>
                            <tbody>
                                {!members || members.length === 0 ? (
                                    <tr><td colSpan="5" className="p-8 text-center text-gray-400">&#x76ee;&#x524d;&#x5c1a;&#x7121;&#x6703;&#x54e1;&#x8cc7;&#x6599;</td></tr>
                                ) : (
                                    members.map((m, i) => (
                                        <tr key={i} className="border-b border-gray-100 hover:bg-gray-50 transition">
                                            <td data-label="&#x5b78;&#x54e1;&#x59d3;&#x540d;" className="p-3 md:p-4 font-bold text-base md:text-lg text-slate-800">{m.name}</td>
                                            <td data-label="&#x6703;&#x54e1;&#x7b49;&#x7d1a;" className="p-3 md:p-4">
                                                <span className="bg-amber-100 text-amber-800 text-xs md:text-sm font-bold px-3 py-1.5 rounded-md">{LEVEL_NAMES[m.level]}</span>
                                            </td>
                                            <td data-label="&#x7d2f;&#x8a08;&#x5b8c;&#x6210;&#x5802;&#x6578;" className="p-3 md:p-4 text-center font-extrabold text-slate-600 text-xl md:text-2xl">{m.totalClasses || 0}</td>
                                            <td data-label="&#x7d2f;&#x7a4d;&#x4ed8;&#x6b3e;&#x91d1;&#x984d;" className="p-3 md:p-4 font-bold text-emerald-700">{paymentTotals ? (m.lineId ? formatMoney(paymentTotals.get(studentPaymentKey(m.lineId, m.studentId)) || 0) : '\u7f3a\u5c11\u5e33\u865f ID') : '\u66ab\u7121\u8cc7\u6599'}</td>
                                            <td data-label="&#x64cd;&#x4f5c;" className="p-3 md:p-4 text-center">
                                                <div className="flex flex-wrap justify-center gap-2">
                                                    <button onClick={() => onOpenStudent(m)} disabled={!m.lineId} className="bg-slate-700 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 px-4 md:px-5 rounded-lg shadow-sm text-xs md:text-sm active:scale-95 transition">
                                                        &#x958b;&#x555f;&#x5b78;&#x751f;&#x756b;&#x9762;
                                                    </button>
                                                    <button onClick={()=>setViewModal({isOpen: true, student: m})} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 md:px-5 rounded-lg shadow-sm text-xs md:text-sm active:scale-95 transition">
                                                        &#x6aa2;&#x8996;&#x8cc7;&#x6599;
                                                    </button>
                                                    <button onClick={() => setPricingStudent(m)} disabled={!m.lineId || !pricingDefaults} className="bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-lg text-xs md:text-sm">&#x5718;&#x8ab2;&#x50f9;&#x683c;</button>
                                                    <button onClick={() => setHistoricalStudent(m)} disabled={!m.lineId} className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-lg text-xs md:text-sm">&#x88dc;&#x767b;&#x6b77;&#x53f2;&#x9810;&#x7d04;</button>
                                                    <button onClick={()=>setLogModalTarget({ lineId: m.lineId, studentId: m.studentId, name: m.name })} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 md:px-5 rounded-lg shadow-sm text-xs md:text-sm active:scale-95 transition">
                                                        &#x88dc;&#x767b;&#x65e5;&#x8a8c;
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    {pricingStudent && <StudentGroupPriceModal student={pricingStudent} originals={pricingDefaults} onClose={() => setPricingStudent(null)} onSaved={async () => { const result = await fetchMembers(); if (result.status !== 'success') throw new Error('\u50f9\u683c\u5df2\u5132\u5b58\uff0c\u4f46\u5b78\u54e1\u540d\u55ae\u91cd\u65b0\u8b80\u53d6\u5931\u6557\uff0c\u8acb\u91cd\u65b0\u6574\u7406\u3002'); }} />}
                    {historicalStudent && <HistoricalBookingModal student={historicalStudent} onClose={() => setHistoricalStudent(null)} onSuccess={async () => { const result = await fetchMembers(); if (result.status !== 'success') throw new Error('\u4ed8\u6b3e\u7d71\u8a08\u8b80\u53d6\u5931\u6557'); onPaymentsChanged(); }} />}
                    {viewModal.isOpen && <StudentDetailsModal student={viewModal.student} onClose={()=>setViewModal({isOpen: false, student: null})} />}
                    {logModalTarget && <LogFormModal targetData={logModalTarget} onClose={() => setLogModalTarget(null)} onSuccess={fetchMembers} />}
                </div>
            );
        };

        const loadStudentAccountForCoach = async member => {
            if (!member?.lineId) throw new Error('\u6b64\u5b78\u54e1\u7f3a\u5c11\u5e33\u865f\u8cc7\u6599\uff0c\u8acb\u91cd\u65b0\u6574\u7406\u540d\u55ae\u3002');
            const result = await fetchAPI({ action: 'checkUser', lineId: member.lineId });
            if (!result || result.status !== 'success') throw new Error(result?.message || '\u5b78\u751f\u8cc7\u6599\u8b80\u53d6\u5931\u6557\uff0c\u8acb\u91cd\u8a66\u3002');
            if (!result.isRegistered || !result.user) throw new Error('\u6b64\u5b78\u54e1\u5e33\u865f\u5c1a\u672a\u5b8c\u6210\u8a3b\u518a\uff0c\u8acb\u8fd4\u56de\u5f8c\u53f0\u78ba\u8a8d\u3002');
            const userRecord = validateAccountRecord(result.user);
            const studentId = member.studentId ?? userRecord.students[0].id;
            if (!userRecord.students.some(student => student.id === studentId)) throw new Error('\u6b64\u5b78\u751f\u5df2\u4e0d\u5728\u5e33\u865f\u5167\uff0c\u8acb\u8fd4\u56de\u5f8c\u53f0\u91cd\u65b0\u6574\u7406\u5b78\u54e1\u540d\u55ae\u3002');
            return { userRecord, studentId };
        };

        const CoachDashboard = () => {
            const [activeTab, setActiveTab] = useState('slots');
            const [selectedStudent, setSelectedStudent] = useState(null);
            const [paymentRevision, setPaymentRevision] = useState(0);
            const paymentsChanged = React.useCallback(() => setPaymentRevision(n => n + 1), []);

            const studentRequestRef = React.useRef(0);
            const returnHashRef = React.useRef('');
            const openStudent = async member => {
                if (!selectedStudent) returnHashRef.current = window.location.hash;
                const requestId = ++studentRequestRef.current;
                setSelectedStudent({ ...member, userRecord: null, loading: true, error: '' });
                try {
                    const account = await loadStudentAccountForCoach(member);
                    if (requestId === studentRequestRef.current) setSelectedStudent({ ...member, ...account, loading: false, error: '' });
                } catch (error) {
                    if (requestId === studentRequestRef.current) setSelectedStudent({ ...member, userRecord: null, loading: false, error: error.message });
                }
            };
            const closeStudent = () => {
                studentRequestRef.current++;
                setSelectedStudent(null);
                window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search + returnHashRef.current);
            };

            if (selectedStudent) {
                return (
                    <div>
                        <div className="student-context sticky top-0 z-40 bg-amber-100 border-b border-amber-300 p-4 flex flex-wrap items-center justify-between gap-3" role="region" aria-label="&#x6559;&#x7df4;&#x5b78;&#x751f;&#x756b;&#x9762;">
                            <div>
                                <p className="font-bold text-amber-950">&#x76ee;&#x524d;&#x64cd;&#x4f5c;&#x5b78;&#x751f;&#xff1a;{selectedStudent.userRecord ? studentNickname(selectedStudent.userRecord.students.find(student => student.id === selectedStudent.studentId)) : studentNickname(selectedStudent)}</p>
                                <p className="text-sm text-amber-900">&#x6559;&#x7df4;&#x6aa2;&#x8996;&#x6a21;&#x5f0f;&#xff1b;&#x9810;&#x7d04;&#x4f9d;&#x6b64;&#x5e33;&#x865f;&#x5168;&#x90e8;&#x5b78;&#x751f;&#x4eba;&#x6578;&#x8207;&#x8ab2;&#x7a0b;&#x898f;&#x5247;&#x767b;&#x8a18;&#x3002;</p>
                            </div>
                            <button onClick={closeStudent} className="bg-slate-800 text-white font-bold px-4 py-2 rounded-lg">&#x8fd4;&#x56de;&#x6559;&#x7df4;&#x5f8c;&#x53f0;</button>
                        </div>
                        {selectedStudent.loading ? <p role="status" className="p-8 text-center text-slate-600">&#x8b80;&#x53d6;&#x5b78;&#x751f;&#x8cc7;&#x6599;&#x4e2d;...</p> : selectedStudent.error ? <div role="alert" className="p-6"><p className="text-red-700">{selectedStudent.error}</p><button onClick={() => openStudent(selectedStudent)} className="mt-4 border rounded-lg px-4 py-3">&#x91cd;&#x65b0;&#x8b80;&#x53d6;&#x5b78;&#x751f;&#x8cc7;&#x6599;</button></div> : <StudentDashboard
                            key={`${selectedStudent.lineId}:${selectedStudent.studentId}`}
                            profile={{ userId: selectedStudent.lineId }}
                            userRecord={selectedStudent.userRecord}
                            initialStudentId={selectedStudent.studentId}
                            coachView
                        />}

                    </div>
                );
            }

            return (
                <div className="coach-shell max-w-6xl mx-auto min-h-screen flex flex-col bg-gray-50 md:shadow-lg md:rounded-b-2xl">
                    <header className="dashboard-header bg-amber-50 text-slate-900 shadow-md relative z-10">
                        <BrandBanner />
                        <div className="dashboard-heading px-4 md:px-8 pt-4">
                            <div className="language-switch-row mb-4">
                                <h1 className="text-xl md:text-3xl font-bold tracking-wider">&#x6559;&#x7df4;&#x7ba1;&#x7406;&#x5f8c;&#x53f0;</h1>
                                <LanguageSwitch />
                            </div>
                            <div className="flex w-full mt-2 border-b border-amber-200">
                                <button onClick={()=>setActiveTab('slots')} className={`flex-1 min-w-0 md:flex-none md:w-48 px-1 py-3 text-sm md:text-base font-bold border-b-4 text-center transition-colors ${activeTab === 'slots' ? 'border-emerald-700 text-emerald-800' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>&#x6392;&#x8ab2;&#x8207;&#x9810;&#x7d04;&#x7ba1;&#x7406;</button>
                                <button onClick={()=>setActiveTab('members')} className={`flex-1 min-w-0 md:flex-none md:w-48 px-1 py-3 text-sm md:text-base font-bold border-b-4 text-center transition-colors ${activeTab === 'members' ? 'border-emerald-700 text-emerald-800' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>&#x5b78;&#x54e1;&#x540d;&#x55ae;&#x8207;&#x8cc7;&#x6599;</button>
                            </div>
                        </div>
                    </header>
                    <div className="flex-1 min-w-0 p-3 md:p-8">
                        {activeTab === 'members' && <CoachRevenue revision={`${activeTab}-${paymentRevision}`} />}
                        {activeTab === 'slots' ? <CoachSlotsView onPaymentsChanged={paymentsChanged} /> : <CoachMembersView onOpenStudent={openStudent} onPaymentsChanged={paymentsChanged} />}
                    </div>
                </div>
            );
        };

        // ==========================================
        // \ud83d\udd39 \u61c9\u7528\u7a0b\u5f0f\u639b\u8f09\u5165\u53e3
        // ==========================================
        const App = () => {
          const [liffState, setLiffState] = useState({ init: false, profile: null });
          const [userRecord, setUserRecord] = useState(null);
          const [view, setView] = useState('loading');
          const [loginError, setLoginError] = useState('');
          const loginBusy = React.useRef(false);
          const login = async () => {
            if (loginBusy.current) return;
            loginBusy.current = true; setView('loading'); setLoginError('');
            try {
              if (typeof liff === 'undefined') throw new Error('LINE \u767b\u5165\u5143\u4ef6\u672a\u8f09\u5165\uff0c\u8acb\u78ba\u8a8d\u7db2\u8def\u5f8c\u91cd\u8a66\u3002');
              rememberStudentRoute();
              await liff.init({ liffId: LIFF_ID });
              if (!liff.isLoggedIn()) { liff.login({ redirectUri: window.location.href.split('#')[0] }); return; }
              restoreStudentRoute();
              const profile = await liff.getProfile();
              if (window.BadmintonI18n) window.BadmintonI18n.remember(profile);
              if (!profile || !profile.userId) throw new Error('\u7121\u6cd5\u53d6\u5f97 LINE \u8eab\u5206\uff0c\u8acb\u78ba\u8a8d LIFF \u7684 profile \u6b0a\u9650\u3002');
              setLiffState({ init: true, profile });
              const res = await fetchAPI({ action: 'checkUser', lineId: profile.userId });
              if (!res || res.status !== 'success') throw new Error((res && res.message) || '\u7121\u6cd5\u78ba\u8a8d\u5e33\u865f\u6b0a\u9650\uff0c\u8acb\u78ba\u8a8d Apps Script \u90e8\u7f72\u53ca\u7db2\u8def\u9023\u7dda\u3002');
              if (res.isAdmin === true) setView('coach');
              else if (res.isRegistered === true && res.user) { setUserRecord(validateAccountRecord(res.user)); setView('student'); }
              else if (res.isRegistered === false && res.isAdmin === false) setView('register');
              else throw new Error('\u5e33\u865f\u6b0a\u9650\u56de\u61c9\u4e0d\u5b8c\u6574\uff0c\u8acb\u66f4\u65b0 Apps Script \u90e8\u7f72\u3002');
            } catch (err) { setLoginError(err.message || '\u767b\u5165\u5931\u6557\uff0c\u8acb\u91cd\u8a66\u3002'); setView('login-error'); }
            finally { loginBusy.current = false; }
          };
          useEffect(() => { login(); }, []);
          if (view === 'loading') return <div className="p-10 text-center text-gray-500 font-bold animate-pulse">&#x6b63;&#x5728;&#x78ba;&#x8a8d; LINE &#x8eab;&#x5206;&#x8207;&#x5e33;&#x865f;&#x6b0a;&#x9650;...</div>;
          if (view === 'login-error') return <div className="login-panel max-w-lg mx-auto p-5 bg-white min-h-screen">
            <div className="language-switch-row mb-4">
              <h1 className="text-xl font-bold">&#x7121;&#x6cd5;&#x5b8c;&#x6210;&#x767b;&#x5165;</h1>
              <LanguageSwitch />
            </div>
            <p role="alert" className="bg-red-50 text-red-800 p-4 rounded-lg mb-4">{loginError}</p>
            <button onClick={login} className="w-full bg-emerald-700 text-white p-3 rounded-lg font-bold">&#x91cd;&#x65b0;&#x5617;&#x8a66;&#x767b;&#x5165;</button>
            {liffState.profile && <div className="mt-5 text-sm text-gray-600"><p>&#x82e5;&#x6559;&#x7df4;&#x8eab;&#x5206;&#x672a;&#x88ab;&#x8fa8;&#x8b58;&#xff0c;&#x8acb;&#x78ba;&#x8a8d;&#x6b64; LINE &#x5e33;&#x865f;&#x7684; user ID &#x5df2;&#x5217;&#x5165;&#x5f8c;&#x7aef; ADMIN_LINE_IDS&#xff0c;&#x4e14; LIFF &#x4f7f;&#x7528;&#x76f8;&#x540c; LINE Provider&#x3002;</p><details className="mt-3"><summary>&#x67e5;&#x770b;&#x76ee;&#x524d;&#x767b;&#x5165;&#x5e33;&#x865f; ID</summary><p className="mt-2 break-all select-all">{liffState.profile.userId}</p></details></div>}
          </div>;
          if (view === 'register') return <RegisterView profile={liffState.profile} onRegistered={(u) => { setUserRecord(u); setView('student'); }} />;
          if (view === 'complete-registration') return <RegisterView profile={liffState.profile} existingUser={userRecord} onCancel={() => setView('student')} onRegistered={u => { setUserRecord(u); setView('student'); }} />;
          if (view === 'student') return <StudentDashboard profile={liffState.profile} userRecord={userRecord} onCompleteRegistration={() => setView('complete-registration')} />;
          if (view === 'coach') return <CoachDashboard />;
        };

        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(<App />);
