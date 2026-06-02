// pages/agenda.js
const { useState, useEffect } = React;

window.Module_Agenda = function({ firmId, showToast }) {
    const [activeTab, setActiveTab] = useState('today'); // today, upcoming, past
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    
    // إعدادات الـ Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 3;

    // الـ State لنموذج إضافة جلسة
    const [formData, setFormData] = useState({
        case_id: '',
        session_date: new Date().toISOString().split('T')[0],
        notes: '',
        status: 'upcoming'
    });

    // States الخاصة بالبحث السريع عن القضايا
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedCaseDisplay, setSelectedCaseDisplay] = useState(null);

    // تصفير الصفحة عند تغيير التبويب
    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab]);

    // 1. جلب بيانات الجلسات مع دمج (Join) القضايا والموكلين
    const allSessions = window.useLiveQuery(async () => {
        if (!window.db) return [];
        const firmCases = await window.db.cases.where('firm_id').equals(firmId).toArray();
        const caseIds = firmCases.map(c => c.id);
        if (caseIds.length === 0) return [];
        
        const clients = await window.db.clients.where('firm_id').equals(firmId).toArray();
        const sessions = await window.db.agenda_sessions.where('case_id').anyOf(caseIds).toArray();
        
        return sessions.map(session => {
            const caseObj = firmCases.find(c => c.id === session.case_id);
            const clientObj = caseObj ? clients.find(c => c.id === caseObj.client_id) : null;
            return {
                ...session,
                case_number: caseObj ? caseObj.case_number : 'غير محدد',
                client_name: clientObj ? clientObj.name : 'غير محدد'
            };
        });
    }, [firmId]) || [];

    // دوال مساعدة للتاريخ
    const getToday = () => new Date().toISOString().split('T')[0];
    const todayStr = getToday();

    // 2. فلترة وترتيب الجلسات حسب التبويب النشط
    const filteredSessions = allSessions.filter(s => {
        if (activeTab === 'today') return s.session_date === todayStr && s.status !== 'completed';
        if (activeTab === 'upcoming') return s.session_date > todayStr && s.status !== 'completed';
        if (activeTab === 'past') return s.session_date < todayStr || s.status === 'completed';
        return true;
    }).sort((a, b) => {
        return activeTab === 'past' 
            ? b.session_date.localeCompare(a.session_date) 
            : a.session_date.localeCompare(b.session_date);
    });

    // 3. تطبيق الـ Pagination على الجلسات المفلترة
    const totalPages = Math.ceil(filteredSessions.length / ITEMS_PER_PAGE) || 1;
    const paginatedSessions = filteredSessions.slice(
        (currentPage - 1) * ITEMS_PER_PAGE, 
        currentPage * ITEMS_PER_PAGE
    );

    // ==========================================
    // دوال محرك بحث القضايا في المودال
    // ==========================================
    const handleSearchCase = async (e) => {
        const term = e.target.value;
        setSearchTerm(term);
        
        if (!term.trim()) {
            setSearchResults([]);
            return;
        }

        setIsSearching(true);
        try {
            const results = await window.db.cases
                .where('firm_id').equals(firmId)
                .filter(c => c.case_number.includes(term))
                .limit(10)
                .toArray();

            const clientIds = [...new Set(results.map(c => c.client_id))];
            const matchingClients = await window.db.clients.where('id').anyOf(clientIds).toArray();

            const enrichedResults = results.map(c => {
                const client = matchingClients.find(cl => cl.id === c.client_id);
                return { ...c, client_name: client ? client.name : 'بدون موكل' };
            });

            setSearchResults(enrichedResults);
        } catch (error) {
            console.error("Search Error:", error);
        } finally {
            setIsSearching(false);
        }
    };

    const selectCase = (caseItem) => {
        setFormData({ ...formData, case_id: caseItem.id });
        setSelectedCaseDisplay(`قضية رقم: ${caseItem.case_number} - (${caseItem.client_name})`);
        setSearchTerm('');
        setSearchResults([]);
    };

    const clearSelectedCase = () => {
        setFormData({ ...formData, case_id: '' });
        setSelectedCaseDisplay(null);
    };

    // ==========================================
    // دوال العمليات (إضافة، تعديل، حذف)
    // ==========================================
    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleAddSession = async (e) => {
        e.preventDefault();
        if (!formData.case_id || !formData.session_date) {
            showToast("الرجاء اختيار القضية وتاريخ الجلسة", "error");
            return;
        }

        try {
            await window.db.agenda_sessions.add({
                case_id: parseInt(formData.case_id),
                session_date: formData.session_date,
                notes: formData.notes,
                status: 'upcoming'
            });
            showToast("تمت إضافة الجلسة بنجاح", "success");
            setIsAddModalOpen(false);
            setFormData({ ...formData, notes: '', case_id: '' });
            setSelectedCaseDisplay(null);
        } catch (error) {
            showToast("حدث خطأ أثناء إضافة الجلسة", "error");
        }
    };

    const handleUpdateStatus = async (id, newStatus) => {
        try {
            await window.db.agenda_sessions.update(id, { status: newStatus });
            showToast(newStatus === 'completed' ? "تم إغلاق الجلسة بنجاح" : "تم استرجاع الجلسة", "success");
        } catch (error) {
            showToast("حدث خطأ في التحديث", "error");
        }
    };

    const handleEditDecision = async (session) => {
        const newNotes = prompt("أدخل القرار أو الملاحظات الجديدة للجلسة:", session.notes || '');
        if (newNotes !== null) {
            try {
                await window.db.agenda_sessions.update(session.id, { notes: newNotes });
                showToast("تم تحديث القرار بنجاح", "success");
            } catch (error) {
                showToast("حدث خطأ في التحديث", "error");
            }
        }
    };

    const handleDeleteSession = async (id) => {
        if (confirm("هل أنت متأكد من حذف هذه الجلسة بشكل نهائي؟")) {
            try {
                await window.db.agenda_sessions.delete(id);
                if (paginatedSessions.length === 1 && currentPage > 1) {
                    setCurrentPage(prev => prev - 1);
                }
                showToast("تم حذف الجلسة", "success");
            } catch (error) {
                showToast("حدث خطأ أثناء الحذف", "error");
            }
        }
    };

    return (
        <div className="space-y-6 animate-view pb-8">
            
            {/* ====== شريط التنقل العلوي (محسن للموبايل) ====== */}
            <div className="bg-white p-3 md:p-4 rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm flex flex-col xl:flex-row justify-between items-center gap-3 md:gap-4">
                
                {/* التبويبات مع تمرير أفقي على الموبايل */}
                <div className="flex gap-2 overflow-x-auto hide-scrollbar w-full xl:w-auto snap-x pb-1">
                    <button 
                        onClick={() => setActiveTab('today')} 
                        className={`snap-center flex-1 md:flex-none px-4 md:px-6 py-2.5 md:py-3 rounded-xl text-xs md:text-sm font-bold transition-all whitespace-nowrap flex items-center justify-center gap-2 ${activeTab === 'today' ? 'bg-[#1E3A8A] text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >
                        جلسات اليوم 
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${activeTab === 'today' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-600'}`}>
                            {allSessions.filter(s => s.session_date === todayStr && s.status !== 'completed').length}
                        </span>
                    </button>
                    <button 
                        onClick={() => setActiveTab('upcoming')} 
                        className={`snap-center flex-1 md:flex-none px-4 md:px-6 py-2.5 md:py-3 rounded-xl text-xs md:text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'upcoming' ? 'bg-[#1E3A8A] text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >
                        الجلسات القادمة
                    </button>
                    <button 
                        onClick={() => setActiveTab('past')} 
                        className={`snap-center flex-1 md:flex-none px-4 md:px-6 py-2.5 md:py-3 rounded-xl text-xs md:text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'past' ? 'bg-[#1E3A8A] text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >
                        السجل والقرارات
                    </button>
                </div>
                
                {/* زر الإضافة */}
                <button 
                    onClick={() => { setIsAddModalOpen(true); clearSelectedCase(); }}
                    className="w-full xl:w-auto bg-gradient-to-l from-[#D4AF37] to-yellow-500 hover:to-yellow-600 text-white px-5 py-3 rounded-xl md:rounded-2xl text-sm font-black shadow-lg shadow-yellow-500/20 transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                    <i className="fas fa-plus"></i> إدراج جلسة بالرول
                </button>
            </div>

            {/* ====== قائمة الجلسات ====== */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
                {paginatedSessions.length === 0 ? (
                    <div className="col-span-full py-16 md:py-24 text-center bg-white rounded-2xl md:rounded-3xl border border-dashed border-slate-300">
                        <div className="w-20 h-20 md:w-24 md:h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl md:text-5xl text-slate-300 shadow-inner">
                            <i className="fas fa-calendar-times"></i>
                        </div>
                        <h3 className="text-xl md:text-2xl font-black text-[#1E3A8A] mb-2">الرول فارغ</h3>
                        <p className="text-xs md:text-sm font-bold text-slate-400">لا توجد جلسات مسجلة في هذا القسم.</p>
                    </div>
                ) : (
                    paginatedSessions.map(session => (
                        <div key={session.id} className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden flex flex-col group">
                            
                            {/* رأس البطاقة */}
                            <div className="p-4 md:p-5 border-b border-slate-50 flex justify-between items-start bg-slate-50/50">
                                <div className="flex items-center gap-3">
                                    <div className={`w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center text-xl md:text-2xl shadow-inner ${session.session_date === todayStr ? 'bg-rose-100 text-rose-600' : session.status === 'completed' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                        <i className={`fas ${session.status === 'completed' ? 'fa-check-circle' : 'fa-gavel'}`}></i>
                                    </div>
                                    <div>
                                        <p className="text-[9px] md:text-[10px] font-bold text-slate-400 mb-0.5 uppercase tracking-wider">تاريخ الجلسة</p>
                                        <h4 className="font-black text-[#1E3A8A] text-base md:text-lg tracking-wide" dir="ltr">{session.session_date}</h4>
                                    </div>
                                </div>
                                {session.status === 'upcoming' && session.session_date === todayStr && (
                                    <span className="bg-rose-500 text-white text-[9px] md:text-[10px] font-black px-2 md:px-3 py-1 rounded-full animate-pulse shadow-md">جلسة اليوم!</span>
                                )}
                            </div>
                            
                            {/* تفاصيل البطاقة */}
                            <div className="p-4 md:p-5 flex-1 space-y-4">
                                <div>
                                    <p className="text-[9px] md:text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">بيانات الدعوى</p>
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <div className="w-5 h-5 md:w-6 md:h-6 rounded bg-slate-100 flex items-center justify-center text-slate-400 text-[10px] md:text-xs"><i className="fas fa-hashtag"></i></div>
                                        <span className="font-bold text-[#1E3A8A] text-xs md:text-sm">رقم: <span className="text-slate-600">{session.case_number}</span></span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-5 h-5 md:w-6 md:h-6 rounded bg-slate-100 flex items-center justify-center text-slate-400 text-[10px] md:text-xs"><i className="fas fa-user-tie"></i></div>
                                        <span className="font-bold text-[#1E3A8A] text-xs md:text-sm line-clamp-1">الموكل: <span className="text-slate-600">{session.client_name}</span></span>
                                    </div>
                                </div>

                                <div className="bg-[#F8FAFC] p-3 md:p-4 rounded-xl md:rounded-2xl border border-slate-100 relative group-hover:bg-white transition-colors">
                                    <p className="text-[9px] md:text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">القرار / المطلوب</p>
                                    <p className="text-xs md:text-sm font-bold text-slate-700 leading-relaxed whitespace-pre-wrap">{session.notes || 'لم يتم تدوين ملاحظات.'}</p>
                                </div>
                            </div>
                            
                            {/* أزرار الإجراءات */}
                            <div className="p-3 md:p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                                <div className="flex gap-2">
                                    {session.status !== 'completed' ? (
                                        <button onClick={() => handleUpdateStatus(session.id, 'completed')} className="w-8 h-8 md:w-9 md:h-9 rounded-lg md:rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-colors"><i className="fas fa-check text-xs md:text-sm"></i></button>
                                    ) : (
                                        <button onClick={() => handleUpdateStatus(session.id, 'upcoming')} className="w-8 h-8 md:w-9 md:h-9 rounded-lg md:rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center hover:bg-amber-500 hover:text-white transition-colors"><i className="fas fa-undo text-xs md:text-sm"></i></button>
                                    )}
                                    <button onClick={() => handleDeleteSession(session.id)} className="w-8 h-8 md:w-9 md:h-9 rounded-lg md:rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-colors"><i className="fas fa-trash text-xs md:text-sm"></i></button>
                                </div>
                                <button onClick={() => handleEditDecision(session)} className="text-[10px] md:text-xs font-bold text-[#1E3A8A] hover:text-[#D4AF37] bg-white border border-slate-200 px-3 md:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl transition-colors flex items-center gap-1.5">
                                    <i className="fas fa-pen"></i> تحديث القرار
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* ====== أزرار التنقل (Pagination) ====== */}
            {filteredSessions.length > ITEMS_PER_PAGE && (
                <div className="flex items-center justify-between bg-white p-3 md:p-4 rounded-xl md:rounded-2xl border border-slate-200 shadow-sm mt-4 md:mt-6">
                    <button 
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-4 py-2 rounded-lg text-xs md:text-sm font-bold bg-slate-100 text-slate-600 hover:bg-[#1E3A8A] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                    >
                        <i className="fas fa-chevron-right text-[10px]"></i> <span className="hidden sm:inline">السابق</span>
                    </button>
                    
                    <span className="text-xs md:text-sm font-black text-[#1E3A8A]">
                        صفحة {currentPage} من {totalPages}
                    </span>

                    <button 
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className="px-4 py-2 rounded-lg text-xs md:text-sm font-bold bg-slate-100 text-slate-600 hover:bg-[#1E3A8A] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                    >
                        <span className="hidden sm:inline">التالي</span> <i className="fas fa-chevron-left text-[10px]"></i>
                    </button>
                </div>
            )}

            {/* ====== الإعلان الترويجي (Ad Banner) ====== */}
            <div className="relative mt-8 bg-gradient-to-r from-slate-900 to-[#1E3A8A] rounded-2xl md:rounded-3xl p-5 md:p-8 text-white shadow-xl overflow-hidden border border-blue-900/50">
                <div className="absolute top-0 right-0 w-40 h-40 bg-[#D4AF37] rounded-full blur-[60px] opacity-20 -mr-10 -mt-10 pointer-events-none"></div>
                
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-5 text-center md:text-right">
                    <div className="flex flex-col sm:flex-row items-center sm:items-start md:items-center gap-4 w-full">
                        <div className="w-14 h-14 shrink-0 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center text-2xl border border-white/20">
                            <i className="fas fa-bolt text-[#D4AF37]"></i>
                        </div>
                        <div>
                            <h4 className="font-black text-lg md:text-xl mb-1">اجعل أجندتك تعمل بذكاء الاصطناعي!</h4>
                            <p className="text-blue-200 text-xs md:text-sm font-semibold max-w-lg leading-relaxed">
                                قم بالترقية للنسخة السحابية للاستمتاع بإرسال إشعارات وتنبيهات الجلسات تلقائياً للمحامين المتدربين على الموبايل، وربط الأجندة مع فريق عملك لحظياً.
                            </p>
                        </div>
                    </div>
                    
                    <div className="w-full md:w-auto shrink-0 flex flex-col sm:flex-row gap-2">
                        <a href="https://wa.me/201211934816" target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto bg-[#D4AF37] hover:bg-yellow-500 text-[#1E3A8A] px-5 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-95">
                            <i className="fab fa-whatsapp text-lg"></i>
                            استفسار عن الترقية
                        </a>
                    </div>
                </div>
            </div>

            {/* ====== Modal: إضافة جلسة (محسنة للموبايل) ====== */}
            {isAddModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-view">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 relative max-h-[90vh] flex flex-col">
                        <div className="bg-gradient-to-r from-[#1E3A8A] to-blue-900 p-5 md:p-6 text-center relative shrink-0">
                            <div className="w-10 h-10 md:w-12 md:h-12 bg-white/10 rounded-full flex items-center justify-center text-white text-lg md:text-xl mx-auto mb-2 backdrop-blur-md">
                                <i className="fas fa-calendar-plus"></i>
                            </div>
                            <h3 className="text-lg md:text-xl font-black text-white tracking-wide">إدراج جلسة جديدة</h3>
                            <button onClick={() => setIsAddModalOpen(false)} className="absolute left-4 top-4 text-white/50 hover:text-white transition text-lg bg-white/5 w-8 h-8 rounded-full flex items-center justify-center">
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        
                        <div className="p-5 md:p-6 overflow-y-auto hide-scrollbar flex-1">
                            <form onSubmit={handleAddSession} className="space-y-4 md:space-y-5">
                                
                                <div className="relative">
                                    <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">القضية المرتبطة <span className="text-rose-500">*</span></label>
                                    
                                    {selectedCaseDisplay ? (
                                        <div className="bg-emerald-50 border-2 border-emerald-200 p-3 rounded-xl flex items-center justify-between">
                                            <span className="text-xs md:text-sm font-bold text-emerald-800 flex items-center gap-2">
                                                <i className="fas fa-check-circle text-emerald-500"></i> {selectedCaseDisplay}
                                            </span>
                                            <button type="button" onClick={clearSelectedCase} className="text-rose-500 hover:bg-rose-100 w-7 h-7 rounded-lg flex items-center justify-center transition-colors">
                                                <i className="fas fa-times text-sm"></i>
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="relative">
                                            <input 
                                                type="text" 
                                                value={searchTerm}
                                                onChange={handleSearchCase}
                                                placeholder="اكتب رقم القضية للبحث..." 
                                                className="w-full p-3 pl-10 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none focus:border-[#D4AF37] focus:bg-white font-bold text-xs md:text-sm text-[#1E3A8A] transition-all"
                                            />
                                            <i className={`fas ${isSearching ? 'fa-spinner fa-spin' : 'fa-search'} absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm`}></i>
                                            
                                            {searchResults.length > 0 && (
                                                <ul className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-40 overflow-y-auto">
                                                    {searchResults.map(c => (
                                                        <li 
                                                            key={c.id} 
                                                            onClick={() => selectCase(c)}
                                                            className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0 flex flex-col transition-colors"
                                                        >
                                                            <span className="font-bold text-[#1E3A8A] text-xs md:text-sm">رقم: {c.case_number}</span>
                                                            <span className="text-[10px] md:text-xs text-slate-500 font-semibold">{c.client_name}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    )}
                                </div>
                                
                                <div>
                                    <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">تاريخ الجلسة <span className="text-rose-500">*</span></label>
                                    <input 
                                        type="date" 
                                        name="session_date" 
                                        value={formData.session_date} 
                                        onChange={handleInputChange} 
                                        required 
                                        className="w-full p-3 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none focus:border-[#D4AF37] focus:bg-white font-bold text-xs md:text-sm text-[#1E3A8A] transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">الطلبات / الملاحظات للتذكير</label>
                                    <textarea 
                                        name="notes" 
                                        value={formData.notes} 
                                        onChange={handleInputChange} 
                                        rows="3" 
                                        placeholder="مثال: تقديم مستندات..." 
                                        className="w-full p-3 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none focus:border-[#D4AF37] focus:bg-white font-bold text-xs md:text-sm text-slate-700 resize-none transition-all"
                                    ></textarea>
                                </div>

                                <div className="pt-2">
                                    <button type="submit" disabled={!formData.case_id} className="w-full bg-[#1E3A8A] hover:bg-blue-900 text-white font-black py-3.5 md:py-4 rounded-xl shadow-lg transition-all text-sm md:text-base flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                                        <i className="fas fa-save"></i> حفظ في الرول
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};