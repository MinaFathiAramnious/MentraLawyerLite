// pages/main.js
const { useState, useEffect } = React;

window.Module_Main = function({ firmId }) {
    // دوال مساعدة للتاريخ
    const getToday = () => new Date().toISOString().split('T')[0];
    const getFirstDayOfMonth = () => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
    };
    const getFirstDayOfYear = () => {
        const d = new Date();
        return new Date(d.getFullYear(), 0, 1).toISOString().split('T')[0];
    };

    // الـ State الخاص بالتواريخ والإحصائيات
    const [startDate, setStartDate] = useState(getFirstDayOfMonth());
    const [endDate, setEndDate] = useState(getToday());
    const [activeFilterBtn, setActiveFilterBtn] = useState('month'); 
    
    const [stats, setStats] = useState({ cases: 0, clients: 0, sessions: 0, totalCases: 0 });
    const [upcomingSessions, setUpcomingSessions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // دالة جلب البيانات بناءً على التاريخ
    useEffect(() => {
        const fetchDashboardData = async () => {
            setIsLoading(true);
            try {
                if(!window.db) return;

                const allCases = await window.db.cases.where('firm_id').equals(firmId).toArray();
                const allClients = await window.db.clients.where('firm_id').equals(firmId).toArray();

                const filteredCases = allCases.filter(c => {
                    if(!c.created_at) return true;
                    const cDate = c.created_at.substring(0, 10);
                    return cDate >= startDate && cDate <= endDate;
                });

                const filteredClients = allClients.filter(c => {
                    if(!c.created_at) return true;
                    const cDate = c.created_at.substring(0, 10);
                    return cDate >= startDate && cDate <= endDate;
                });

                const caseIds = allCases.map(c => c.id);
                let allSessions =[];
                if(caseIds.length > 0) {
                    allSessions = await window.db.agenda_sessions.where('case_id').anyOf(caseIds).toArray();
                }

                const filteredSessions = allSessions.filter(s => {
                    return s.session_date >= startDate && s.session_date <= endDate;
                });

                const today = getToday();
                const upcoming = allSessions
                    .filter(s => s.session_date >= today && s.status !== 'completed')
                    .sort((a, b) => a.session_date.localeCompare(b.session_date))
                    .slice(0, 5); 

                const upcomingWithDetails = upcoming.map(session => {
                    const caseObj = allCases.find(c => c.id === session.case_id);
                    return { ...session, case_number: caseObj ? caseObj.case_number : 'غير محدد' };
                });

                setStats({
                    cases: filteredCases.length,
                    clients: filteredClients.length,
                    sessions: filteredSessions.length,
                    totalCases: allCases.length
                });
                setUpcomingSessions(upcomingWithDetails);

            } catch (error) {
                console.error("خطأ في جلب بيانات لوحة التحكم:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchDashboardData();
    }, [firmId, startDate, endDate]);

    const applyQuickFilter = (type) => {
        setActiveFilterBtn(type);
        if (type === 'month') {
            setStartDate(getFirstDayOfMonth());
            setEndDate(getToday());
        } else if (type === 'year') {
            setStartDate(getFirstDayOfYear());
            setEndDate(getToday());
        } else if (type === 'all') {
            setStartDate('2000-01-01');
            setEndDate('2099-12-31');
        }
    };

    return (
        <div className="space-y-6 animate-view pb-6">
            
            {/* ====== شريط الفلترة الزمنية (محسن للموبايل) ====== */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col xl:flex-row justify-between gap-4">
                
                {/* أزرار الفلترة السريعة (تمرير أفقي على الموبايل) */}
                <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1 w-full xl:w-auto snap-x">
                    <button onClick={() => applyQuickFilter('month')} className={`whitespace-nowrap snap-center px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${activeFilterBtn === 'month' ? 'bg-[#1E3A8A] text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>هذا الشهر</button>
                    <button onClick={() => applyQuickFilter('year')} className={`whitespace-nowrap snap-center px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${activeFilterBtn === 'year' ? 'bg-[#1E3A8A] text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>هذا العام</button>
                    <button onClick={() => applyQuickFilter('all')} className={`whitespace-nowrap snap-center px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${activeFilterBtn === 'all' ? 'bg-[#1E3A8A] text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>كل الأوقات</button>
                </div>
                
                {/* حقول التاريخ (تأخذ عرض كامل على الموبايل) */}
                <div className="grid grid-cols-2 xl:flex items-center gap-3 w-full xl:w-auto">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 w-full">
                        <span className="text-[10px] sm:text-xs font-bold text-slate-400">من</span>
                        <input type="date" value={startDate} onChange={(e) => {setStartDate(e.target.value); setActiveFilterBtn('custom');}} className="bg-transparent text-xs sm:text-sm font-bold text-[#1E3A8A] outline-none w-full" />
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 w-full">
                        <span className="text-[10px] sm:text-xs font-bold text-slate-400">إلى</span>
                        <input type="date" value={endDate} onChange={(e) => {setEndDate(e.target.value); setActiveFilterBtn('custom');}} className="bg-transparent text-xs sm:text-sm font-bold text-[#1E3A8A] outline-none w-full" />
                    </div>
                </div>
            </div>

            {/* ====== البطاقات الإحصائية ====== */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-6">
                <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] relative overflow-hidden group flex flex-col justify-between h-full">
                    <div className="absolute -left-6 -top-6 w-24 h-24 bg-blue-50 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500"></div>
                    <div className="relative z-10 flex justify-between items-start mb-2">
                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-gradient-to-br from-[#1E3A8A] to-blue-600 text-white flex items-center justify-center text-lg md:text-xl shadow-lg shadow-blue-900/20"><i className="fas fa-gavel"></i></div>
                        <h3 className="text-2xl md:text-4xl font-black text-[#1E3A8A]">
                            {isLoading ? <i className="fas fa-spinner fa-spin text-lg text-slate-300"></i> : stats.cases}
                        </h3>
                    </div>
                    <div className="relative z-10">
                        <p className="text-[11px] md:text-xs font-bold text-slate-500">القضايا المضافة</p>
                        <p className="text-[9px] md:text-[10px] font-bold text-emerald-500 mt-1">في النطاق الزمني</p>
                    </div>
                </div>

                <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] relative overflow-hidden group flex flex-col justify-between h-full">
                    <div className="absolute -left-6 -top-6 w-24 h-24 bg-emerald-50 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500"></div>
                    <div className="relative z-10 flex justify-between items-start mb-2">
                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white flex items-center justify-center text-lg md:text-xl shadow-lg shadow-emerald-500/20"><i className="fas fa-users"></i></div>
                        <h3 className="text-2xl md:text-4xl font-black text-[#1E3A8A]">
                            {isLoading ? <i className="fas fa-spinner fa-spin text-lg text-slate-300"></i> : stats.clients}
                        </h3>
                    </div>
                    <div className="relative z-10">
                        <p className="text-[11px] md:text-xs font-bold text-slate-500">الموكلين الجدد</p>
                        <p className="text-[9px] md:text-[10px] font-bold text-emerald-500 mt-1">في النطاق الزمني</p>
                    </div>
                </div>

                <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] relative overflow-hidden group flex flex-col justify-between h-full">
                    <div className="absolute -left-6 -top-6 w-24 h-24 bg-amber-50 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500"></div>
                    <div className="relative z-10 flex justify-between items-start mb-2">
                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-gradient-to-br from-[#D4AF37] to-yellow-600 text-white flex items-center justify-center text-lg md:text-xl shadow-lg shadow-yellow-500/20"><i className="fas fa-calendar-alt"></i></div>
                        <h3 className="text-2xl md:text-4xl font-black text-[#1E3A8A]">
                            {isLoading ? <i className="fas fa-spinner fa-spin text-lg text-slate-300"></i> : stats.sessions}
                        </h3>
                    </div>
                    <div className="relative z-10">
                        <p className="text-[11px] md:text-xs font-bold text-slate-500">جلسات المحاكم</p>
                        <p className="text-[9px] md:text-[10px] font-bold text-amber-500 mt-1">في النطاق الزمني</p>
                    </div>
                </div>

                <div className="bg-[#0B1120] p-4 md:p-6 rounded-2xl md:rounded-3xl border border-slate-800 shadow-xl relative overflow-hidden group flex flex-col justify-between h-full">
                    <div className="absolute top-0 right-0 w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjIiIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSIvPjwvc3ZnPg==')] opacity-50"></div>
                    <div className="relative z-10 flex justify-between items-start mb-2">
                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-white/10 text-[#D4AF37] backdrop-blur-sm flex items-center justify-center text-lg md:text-xl border border-white/5"><i className="fas fa-archive"></i></div>
                        <h3 className="text-2xl md:text-4xl font-black text-white">
                            {isLoading ? <i className="fas fa-spinner fa-spin text-lg text-slate-500"></i> : stats.totalCases}
                        </h3>
                    </div>
                    <div className="relative z-10">
                        <p className="text-[11px] md:text-xs font-bold text-slate-400">إجمالي القضايا</p>
                        <p className="text-[9px] md:text-[10px] font-bold text-[#D4AF37] mt-1">تراكمي (كل الأوقات)</p>
                    </div>
                </div>
            </div>

            {/* ====== أقرب الجلسات (محسنة للموبايل والديسكتوب) ====== */}
            <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-4 md:p-5 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-bold text-[#1E3A8A] flex items-center gap-2 text-sm md:text-base">
                        <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shadow-inner"><i className="fas fa-clock text-xs md:text-sm"></i></div>
                        أقرب جلسات المحاكم القادمة
                    </h3>
                </div>
                
                <div className="p-0 md:p-2">
                    {isLoading ? (
                        <div className="py-10 text-center"><i className="fas fa-circle-notch fa-spin text-2xl text-[#D4AF37]"></i></div>
                    ) : upcomingSessions.length === 0 ? (
                        <div className="py-10 md:py-12 text-center flex flex-col items-center">
                            <div className="w-14 h-14 md:w-16 md:h-16 bg-slate-50 rounded-full flex items-center justify-center mb-3"><i className="fas fa-mug-hot text-xl md:text-2xl text-slate-300"></i></div>
                            <p className="text-slate-400 font-bold text-xs md:text-sm">لا توجد جلسات مجدولة قريباً، استمتع بقهوتك!</p>
                        </div>
                    ) : (
                        <>
                            {/* عرض الموبايل (بطاقات) */}
                            <div className="block md:hidden divide-y divide-slate-100">
                                {upcomingSessions.map((session, idx) => (
                                    <div key={idx} className="p-4 hover:bg-slate-50 transition-colors">
                                        <div className="flex justify-between items-center mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                                                <span className="font-black text-[#1E3A8A] text-sm dir-ltr">{session.session_date}</span>
                                            </div>
                                            <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[10px] font-bold">قضية: {session.case_number}</span>
                                        </div>
                                        <p className="text-slate-500 text-xs font-semibold leading-relaxed mt-1">
                                            <i className="fas fa-info-circle text-slate-300 ml-1"></i>
                                            {session.notes || 'لا توجد ملاحظات أو قرارات سابقة مسجلة.'}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            {/* عرض الديسكتوب (جدول) */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-right text-sm">
                                    <thead>
                                        <tr className="text-slate-400 text-[11px] uppercase tracking-wider bg-slate-50/50">
                                            <th className="px-4 py-3 font-bold rounded-r-lg">تاريخ الجلسة</th>
                                            <th className="px-4 py-3 font-bold">رقم القضية</th>
                                            <th className="px-4 py-3 font-bold rounded-l-lg">القرار السابق / الملاحظات</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {upcomingSessions.map((session, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-amber-500 group-hover:animate-ping"></span>
                                                        <span className="font-bold text-[#1E3A8A] dir-ltr">{session.session_date}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 font-black text-slate-700">{session.case_number}</td>
                                                <td className="px-4 py-3 text-slate-500 text-xs font-semibold">{session.notes || 'لا توجد ملاحظات'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ====== إعلان النسخة المدفوعة والدعم الفني (تصميم جديد متجاوب وجذاب) ====== */}
            <div className="relative mt-8 bg-gradient-to-br from-[#0F172A] via-[#1E3A8A] to-[#1e40af] rounded-3xl p-6 md:p-8 text-white shadow-2xl overflow-hidden border border-blue-800/50">
                {/* تأثيرات خلفية متحركة/مضيئة */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500 rounded-full blur-[80px] opacity-20 -mr-20 -mt-20 pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#D4AF37] rounded-full blur-[60px] opacity-20 -ml-10 -mb-10 pointer-events-none"></div>
                
                <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-6 md:gap-8 text-center lg:text-right">
                    
                    {/* النصوص والأيقونة */}
                    <div className="flex flex-col sm:flex-row items-center sm:items-start lg:items-center gap-4 sm:gap-5 w-full">
                        <div className="w-16 h-16 shrink-0 bg-gradient-to-br from-[#D4AF37] to-yellow-600 rounded-2xl flex items-center justify-center text-3xl shadow-[0_0_30px_rgba(212,175,55,0.4)] border border-yellow-400/30">
                            <i className="fas fa-crown text-white"></i>
                        </div>
                        <div>
                            <h4 className="font-black text-xl md:text-2xl mb-1 tracking-tight">نظام متكامل ينتظر مكتبك!</h4>
                            <p className="text-blue-200 text-xs md:text-sm font-semibold leading-relaxed max-w-xl">
                                أنت تستخدم النسخة المصغرة (Lite). قم بالترقية للنسخة الاحترافية (Cloud) للاستمتاع بالمزامنة بين أجهزتك، إضافة سكرتارية، وأرشفة ملفات الـ PDF والصور سحابياً.
                            </p>
                        </div>
                    </div>
                    
                    {/* الأزرار (تأخذ عرض كامل على الموبايل) */}
                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto shrink-0">
                        <a href="https://wa.me/201211934816" target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto bg-[#25D366] hover:bg-[#1ebd5b] text-white px-6 py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-900/30 active:scale-95">
                            <i className="fab fa-whatsapp text-xl"></i>
                            تواصل واتساب
                        </a>
                        <a href="tel:01211934816" className="w-full sm:w-auto bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white px-6 py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-95 dir-ltr">
                            <i className="fas fa-phone-alt text-[#D4AF37]"></i>
                            01211934816
                        </a>
                    </div>
                    
                </div>
            </div>

        </div>
    );
};