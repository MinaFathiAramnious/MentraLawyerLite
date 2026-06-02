// pages/cases.js
const { useState, useEffect } = React;

window.Module_Cases = function({ firmId, showToast }) {
    // ==========================================
    // 1. States الأساسية
    // ==========================================
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState(null);
    
    const [filters, setFilters] = useState({ search: '', startDate: '', endDate: '', status: 'all' });
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 5;

    const [tableData, setTableData] = useState([]);
    const [totalFilteredItems, setTotalFilteredItems] = useState(0);

    const [formData, setFormData] = useState({
        case_number: '', client_id: '', case_type_id: '', court_id: '', case_status: 'متداولة', created_at: new Date().toISOString().split('T')[0]
    });

    // ==========================================
    // 2. States لمحركات البحث الذكية
    // ==========================================
    const [clientSearch, setClientSearch] = useState({ term: '', results: [], isSearching: false, display: null });
    const [courtSearch, setCourtSearch] = useState({ term: '', results: [], isSearching: false, display: null });
    const [typeSearch, setTypeSearch] = useState({ term: '', results: [], isSearching: false, display: null });

    // ==========================================
    // 3. جلب القضايا الخام ومعالجة الجدول (Lazy Relations)
    // ==========================================
    const rawCases = window.useLiveQuery(() => window.db.cases.where('firm_id').equals(firmId).reverse().toArray(), [firmId]) || [];

    useEffect(() => {
        const processTableData = async () => {
            if (!rawCases.length) {
                setTableData([]);
                setTotalFilteredItems(0);
                return;
            }

            let filtered = rawCases;
            if (filters.search) {
                const q = filters.search.toLowerCase();
                filtered = filtered.filter(c => c.case_number.includes(q));
            }
            if (filters.startDate) {
                filtered = filtered.filter(c => c.created_at.substring(0, 10) >= filters.startDate);
            }
            if (filters.endDate) {
                filtered = filtered.filter(c => c.created_at.substring(0, 10) <= filters.endDate);
            }
            if (filters.status !== 'all') {
                filtered = filtered.filter(c => c.case_status === filters.status);
            }

            setTotalFilteredItems(filtered.length);

            const startIndex = (currentPage - 1) * itemsPerPage;
            const pagedCases = filtered.slice(startIndex, startIndex + itemsPerPage);

            const enrichedCases = await Promise.all(pagedCases.map(async (c) => {
                const client = await window.db.clients.get(c.client_id);
                const court = c.court_id ? await window.db.global_courts.get(c.court_id) : null;
                const type = c.case_type_id ? await window.db.global_case_types.get(c.case_type_id) : null;
                
                return {
                    ...c,
                    client_name: client ? client.name : 'محذوف / غير محدد',
                    court_name: court ? court.name : 'غير محدد',
                    type_name: type ? type.name : 'غير محدد',
                    safe_date: c.created_at ? c.created_at.substring(0, 10) : ''
                };
            }));

            setTableData(enrichedCases);
        };

        processTableData();
    }, [rawCases, filters, currentPage]);

    const totalPages = Math.ceil(totalFilteredItems / itemsPerPage) || 1;

    // ==========================================
    // 4. دوال محركات البحث (Live Search - Limit 10)
    // ==========================================
    const handleSearchClient = async (e) => {
        const term = e.target.value;
        setClientSearch(prev => ({ ...prev, term }));
        if (!term.trim()) return setClientSearch(prev => ({ ...prev, results: [] }));
        
        setClientSearch(prev => ({ ...prev, isSearching: true }));
        const results = await window.db.clients.where('firm_id').equals(firmId).filter(c => c.name.includes(term)).limit(10).toArray();
        setClientSearch(prev => ({ ...prev, results, isSearching: false }));
    };

    const handleSearchCourt = async (e) => {
        const term = e.target.value;
        setCourtSearch(prev => ({ ...prev, term }));
        if (!term.trim()) return setCourtSearch(prev => ({ ...prev, results: [] }));
        
        setCourtSearch(prev => ({ ...prev, isSearching: true }));
        const results = await window.db.global_courts.filter(c => c.name.includes(term)).limit(10).toArray();
        setCourtSearch(prev => ({ ...prev, results, isSearching: false }));
    };

    const handleSearchType = async (e) => {
        const term = e.target.value;
        setTypeSearch(prev => ({ ...prev, term }));
        if (!term.trim()) return setTypeSearch(prev => ({ ...prev, results: [] }));
        
        setTypeSearch(prev => ({ ...prev, isSearching: true }));
        const results = await window.db.global_case_types.filter(c => c.name.includes(term)).limit(10).toArray();
        setTypeSearch(prev => ({ ...prev, results, isSearching: false }));
    };

    const selectItem = (type, item) => {
        if (type === 'client') {
            setFormData({ ...formData, client_id: item.id });
            setClientSearch({ term: '', results: [], isSearching: false, display: item.name });
        } else if (type === 'court') {
            setFormData({ ...formData, court_id: item.id });
            setCourtSearch({ term: '', results: [], isSearching: false, display: item.name });
        } else if (type === 'type') {
            setFormData({ ...formData, case_type_id: item.id });
            setTypeSearch({ term: '', results: [], isSearching: false, display: item.name });
        }
    };

    const clearSelection = (type) => {
        if (type === 'client') { setFormData({ ...formData, client_id: '' }); setClientSearch(prev => ({ ...prev, display: null })); }
        if (type === 'court') { setFormData({ ...formData, court_id: '' }); setCourtSearch(prev => ({ ...prev, display: null })); }
        if (type === 'type') { setFormData({ ...formData, case_type_id: '' }); setTypeSearch(prev => ({ ...prev, display: null })); }
    };

    // ==========================================
    // 5. دوال الإضافة والتعديل والحذف
    // ==========================================
    const openAddModal = () => {
        setIsEditing(false); setEditId(null);
        setFormData({ case_number: '', client_id: '', case_type_id: '', court_id: '', case_status: 'متداولة', created_at: new Date().toISOString().split('T')[0] });
        setClientSearch({ term: '', results: [], isSearching: false, display: null });
        setCourtSearch({ term: '', results: [], isSearching: false, display: null });
        setTypeSearch({ term: '', results: [], isSearching: false, display: null });
        setIsModalOpen(true);
    };

    const openEditModal = (caseItem) => {
        setIsEditing(true); setEditId(caseItem.id);
        setFormData({
            case_number: caseItem.case_number, client_id: caseItem.client_id, case_type_id: caseItem.case_type_id || '', court_id: caseItem.court_id || '', case_status: caseItem.case_status, created_at: caseItem.safe_date
        });
        setClientSearch(prev => ({ ...prev, display: caseItem.client_name }));
        setCourtSearch(prev => ({ ...prev, display: caseItem.court_name }));
        setTypeSearch(prev => ({ ...prev, display: caseItem.type_name }));
        setIsModalOpen(true);
    };

    const handleSaveCase = async (e) => {
        e.preventDefault();
        if (!formData.client_id || !formData.court_id || !formData.case_type_id) {
            showToast("الرجاء استكمال اختيار الموكل والمحكمة ونوع القضية", "error");
            return;
        }

        setIsLoading(true);
        try {
            const caseData = {
                firm_id: firmId,
                case_number: formData.case_number,
                client_id: parseInt(formData.client_id),
                case_type_id: parseInt(formData.case_type_id),
                court_id: parseInt(formData.court_id),
                case_status: formData.case_status,
                created_at: new Date(formData.created_at).toISOString()
            };

            if (isEditing) {
                await window.db.cases.update(editId, caseData);
                showToast("تم تحديث بيانات القضية بنجاح", "success");
            } else {
                await window.db.cases.add(caseData);
                showToast("تم تسجيل القضية بنجاح", "success");
            }
            setIsModalOpen(false);
        } catch (error) { showToast("حدث خطأ أثناء الحفظ", "error"); } 
        finally { setIsLoading(false); }
    };

    const handleDelete = async (id) => {
        if (confirm("هل أنت متأكد من حذف هذه القضية نهائياً؟")) {
            try {
                await window.db.cases.delete(id);
                if (tableData.length === 1 && currentPage > 1) setCurrentPage(prev => prev - 1);
                showToast("تم الحذف بنجاح", "success");
            } catch (error) { showToast("فشل الحذف", "error"); }
        }
    };

    const handleFilterChange = (e) => {
        setFilters({ ...filters, [e.target.name]: e.target.value });
        setCurrentPage(1);
    };

    const getStatusBadge = (status) => {
        switch(status) {
            case 'متداولة': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'محجوزة للحكم': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'منتهية': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            default: return 'bg-slate-100 text-slate-700 border-slate-200';
        }
    };

    return (
        <div className="space-y-6 animate-view pb-8">
            
            {/* ====== 1. الرأس وشريط الفلترة (محسن للموبايل) ====== */}
            <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm p-4 md:p-5">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 md:mb-6">
                    <h3 className="font-black text-lg md:text-xl text-[#1E3A8A] flex items-center gap-2 w-full md:w-auto">
                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><i className="fas fa-gavel"></i></div>
                        سجل القضايا
                        <span className="text-[10px] md:text-xs font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-lg mr-auto md:ml-2 md:mr-0 border border-slate-200">{totalFilteredItems} قضية</span>
                    </h3>
                    <button onClick={openAddModal} className="w-full md:w-auto bg-gradient-to-l from-[#1E3A8A] to-blue-800 hover:to-blue-900 text-white px-5 py-3 md:px-6 rounded-xl md:rounded-2xl text-sm font-bold shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-2 active:scale-95">
                        <i className="fas fa-plus"></i> تسجيل قضية جديدة
                    </button>
                </div>

                {/* شبكة الفلاتر */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-slate-100">
                    <div className="relative">
                        <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                        <input type="text" name="search" value={filters.search} onChange={handleFilterChange} placeholder="بحث برقم القضية..." className="w-full bg-white border border-slate-200 rounded-xl py-2.5 md:py-3 pr-10 pl-4 text-xs md:text-sm font-bold text-[#1E3A8A] outline-none focus:border-[#D4AF37] transition" />
                    </div>
                    <div>
                        <select name="status" value={filters.status} onChange={handleFilterChange} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 md:py-3 px-4 text-xs md:text-sm font-bold text-[#1E3A8A] outline-none focus:border-[#D4AF37] transition cursor-pointer">
                            <option value="all">جميع الحالات</option>
                            <option value="متداولة">متداولة</option>
                            <option value="محجوزة للحكم">محجوزة للحكم</option>
                            <option value="منتهية">منتهية</option>
                        </select>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200">
                        <span className="text-[10px] md:text-xs font-bold text-slate-400 whitespace-nowrap">من:</span>
                        <input type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} className="bg-transparent text-xs md:text-sm font-bold text-[#1E3A8A] outline-none w-full" />
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200">
                        <span className="text-[10px] md:text-xs font-bold text-slate-400 whitespace-nowrap">إلى:</span>
                        <input type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} className="bg-transparent text-xs md:text-sm font-bold text-[#1E3A8A] outline-none w-full" />
                    </div>
                </div>
            </div>

            {/* ====== 2. عرض البيانات (محسن: بطاقات للموبايل، جدول للديسكتوب) ====== */}
            <div className="bg-transparent md:bg-white rounded-none md:rounded-3xl border-none md:border md:border-slate-200 md:shadow-sm overflow-hidden">
                {tableData.length === 0 ? (
                    <div className="py-16 md:py-20 text-center flex flex-col items-center bg-white rounded-2xl md:rounded-none border border-slate-200 md:border-none shadow-sm md:shadow-none">
                        <div className="w-16 h-16 md:w-20 md:h-20 bg-slate-50 rounded-full flex items-center justify-center mb-3 md:mb-4 text-3xl md:text-4xl text-slate-300"><i className="fas fa-folder-open"></i></div>
                        <h3 className="font-black text-lg md:text-xl text-[#1E3A8A] mb-1">لا توجد قضايا</h3>
                        <p className="text-slate-400 font-bold text-xs md:text-sm">لم يتم العثور على بيانات تطابق بحثك.</p>
                    </div>
                ) : (
                    <>
                        {/* عرض الموبايل (Cards) */}
                        <div className="md:hidden flex flex-col gap-3">
                            {tableData.map((c) => (
                                <div key={c.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 relative overflow-hidden">
                                    {/* شريط علوي للبطاقة */}
                                    <div className="flex justify-between items-start mb-3 border-b border-slate-50 pb-3">
                                        <div>
                                            <div className="font-black text-[#1E3A8A] text-base">{c.case_number}</div>
                                            <div className="text-[10px] text-slate-400 font-bold mt-0.5"><i className="fas fa-calendar-alt mr-1"></i> {c.safe_date}</div>
                                        </div>
                                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-md border ${getStatusBadge(c.case_status)}`}>{c.case_status}</span>
                                    </div>
                                    
                                    {/* تفاصيل البطاقة */}
                                    <div className="space-y-2 mb-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-md bg-slate-50 text-slate-400 flex items-center justify-center text-[10px]"><i className="fas fa-user"></i></div>
                                            <span className="font-bold text-slate-700 text-xs truncate flex-1">{c.client_name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-md bg-slate-50 text-slate-400 flex items-center justify-center text-[10px]"><i className="fas fa-building"></i></div>
                                            <div className="flex flex-col flex-1">
                                                <span className="font-bold text-slate-700 text-xs truncate">{c.court_name}</span>
                                                <span className="text-[9px] text-slate-500 font-bold">{c.type_name}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* أزرار الإجراءات */}
                                    <div className="flex gap-2 pt-3 border-t border-slate-50">
                                        <button onClick={() => openEditModal(c)} className="flex-1 bg-emerald-50 text-emerald-700 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 hover:bg-emerald-500 hover:text-white transition-colors">
                                            <i className="fas fa-pen"></i> تعديل
                                        </button>
                                        <button onClick={() => handleDelete(c.id)} className="flex-1 bg-rose-50 text-rose-700 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 hover:bg-rose-500 hover:text-white transition-colors">
                                            <i className="fas fa-trash"></i> حذف
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* عرض الديسكتوب (Table) */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-right">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wider font-bold">
                                        <th className="px-6 py-4 rounded-tr-3xl">رقم الدعوى</th>
                                        <th className="px-6 py-4">الموكل</th>
                                        <th className="px-6 py-4">المحكمة / النوع</th>
                                        <th className="px-6 py-4 text-center">الحالة</th>
                                        <th className="px-6 py-4 rounded-tl-3xl text-center">إجراءات</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {tableData.map((c) => (
                                        <tr key={c.id} className="hover:bg-blue-50/30 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="font-black text-[#1E3A8A] text-lg">{c.case_number}</div>
                                                <div className="text-[10px] text-slate-400 font-bold mt-1"><i className="fas fa-calendar-alt mr-1"></i> {c.safe_date}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs"><i className="fas fa-user"></i></div>
                                                    <span className="font-bold text-slate-700">{c.client_name}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-slate-700 text-sm mb-1">{c.court_name}</div>
                                                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold border border-slate-200">{c.type_name}</span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`text-[10px] font-black px-3 py-1.5 rounded-full border ${getStatusBadge(c.case_status)}`}>{c.case_status}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button onClick={() => openEditModal(c)} className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-colors" title="تعديل القضية"><i className="fas fa-pen"></i></button>
                                                    <button onClick={() => handleDelete(c.id)} className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-colors" title="حذف القضية"><i className="fas fa-trash"></i></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
                
                {/* ====== 3. Pagination ====== */}
                {totalFilteredItems > itemsPerPage && (
                    <div className="p-3 md:p-4 mt-3 md:mt-0 border border-slate-200 md:border-t md:border-x-0 md:border-b-0 bg-white md:bg-slate-50 flex items-center justify-between rounded-2xl md:rounded-none shadow-sm md:shadow-none">
                        <p className="text-[11px] md:text-xs font-bold text-slate-500">
                            صفحة {currentPage} من {totalPages}
                        </p>
                        <div className="flex gap-1">
                            <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-[#1E3A8A] hover:text-white transition-colors disabled:opacity-50"><i className="fas fa-chevron-right text-[10px] md:text-xs"></i></button>
                            <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-[#1E3A8A] hover:text-white transition-colors disabled:opacity-50"><i className="fas fa-chevron-left text-[10px] md:text-xs"></i></button>
                        </div>
                    </div>
                )}
            </div>

            {/* ====== الإعلان الترويجي ====== */}
            <div className="relative mt-8 bg-gradient-to-l from-slate-900 to-[#0F172A] rounded-2xl md:rounded-3xl p-5 md:p-8 text-white shadow-xl overflow-hidden border border-slate-800">
                <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-emerald-500 rounded-full blur-[70px] opacity-20 pointer-events-none"></div>
                
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-5 text-center md:text-right">
                    <div className="flex flex-col sm:flex-row items-center sm:items-start md:items-center gap-4 w-full">
                        <div className="w-14 h-14 shrink-0 bg-white/5 backdrop-blur-sm rounded-2xl flex items-center justify-center text-2xl border border-white/10 text-emerald-400">
                            <i className="fas fa-users-cog"></i>
                        </div>
                        <div>
                            <h4 className="font-black text-lg md:text-xl mb-1 text-white">هل لديك سكرتارية أو شركاء؟</h4>
                            <p className="text-slate-400 text-xs md:text-sm font-semibold max-w-lg leading-relaxed">
                                النسخة المجانية تعمل على جهاز واحد فقط. بادر بالترقية للنسخة السحابية لربط جميع أجهزة المكتب، تعيين صلاحيات لكل مستخدم، والعمل على نفس القضايا في وقت واحد!
                            </p>
                        </div>
                    </div>
                    
                    <div className="w-full md:w-auto shrink-0">
                        <a href="https://wa.me/201211934816" target="_blank" rel="noopener noreferrer" className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3.5 rounded-xl font-black text-sm transition-all active:scale-95 shadow-lg shadow-emerald-900/30">
                            <i className="fab fa-whatsapp text-lg"></i>
                            تفعيل العمل الجماعي
                        </a>
                    </div>
                </div>
            </div>

            {/* ====== 4. Modal (نافذة الإضافة والتعديل محسنة للموبايل) ====== */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-3 sm:p-4 animate-view">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[95vh] md:max-h-[90vh]">
                        
                        <div className="bg-gradient-to-r from-[#1E3A8A] to-blue-900 p-4 md:p-6 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-3 text-white">
                                <div className="w-8 h-8 md:w-10 md:h-10 bg-white/10 rounded-xl flex items-center justify-center text-base md:text-xl backdrop-blur-md"><i className={`fas ${isEditing ? 'fa-pen' : 'fa-balance-scale'}`}></i></div>
                                <h3 className="text-base md:text-xl font-black tracking-wide">{isEditing ? 'تعديل بيانات القضية' : 'تسجيل قضية جديدة'}</h3>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="text-white/50 hover:text-white transition text-lg bg-white/5 w-8 h-8 rounded-full flex items-center justify-center"><i className="fas fa-times"></i></button>
                        </div>

                        <div className="p-4 md:p-6 overflow-y-auto custom-scrollbar flex-1">
                            <form onSubmit={handleSaveCase} className="space-y-4 md:space-y-5">
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                                    <div>
                                        <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">رقم القضية وسنتها <span className="text-rose-500">*</span></label>
                                        <input type="text" name="case_number" value={formData.case_number} onChange={(e) => setFormData({...formData, case_number: e.target.value})} required placeholder="مثال: 1234 لسنة 2024" className="w-full p-3 md:p-3.5 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none focus:border-[#D4AF37] focus:bg-white font-bold text-xs md:text-sm text-[#1E3A8A] transition-all" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">تاريخ الإضافة <span className="text-rose-500">*</span></label>
                                        <input type="date" name="created_at" value={formData.created_at} onChange={(e) => setFormData({...formData, created_at: e.target.value})} required className="w-full p-3 md:p-3.5 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none focus:border-[#D4AF37] focus:bg-white font-bold text-xs md:text-sm text-[#1E3A8A] transition-all" />
                                    </div>
                                </div>

                                {/* بحث الموكل */}
                                <div className="relative">
                                    <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">الموكل المرتبط <span className="text-rose-500">*</span></label>
                                    {clientSearch.display ? (
                                        <div className="bg-emerald-50 border-2 border-emerald-200 p-3 rounded-xl flex items-center justify-between">
                                            <span className="text-xs md:text-sm font-bold text-emerald-800 flex items-center gap-1.5"><i className="fas fa-check-circle text-emerald-500"></i><span className="truncate">{clientSearch.display}</span></span>
                                            <button type="button" onClick={() => clearSelection('client')} className="text-rose-500 hover:bg-rose-100 w-7 h-7 rounded-lg transition-colors flex shrink-0 items-center justify-center"><i className="fas fa-times text-sm"></i></button>
                                        </div>
                                    ) : (
                                        <div className="relative">
                                            <input type="text" value={clientSearch.term} onChange={handleSearchClient} placeholder="ابحث باسم الموكل..." className="w-full p-3 md:p-3.5 pl-10 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none focus:border-[#D4AF37] font-bold text-xs md:text-sm text-[#1E3A8A]" />
                                            <i className={`fas ${clientSearch.isSearching ? 'fa-spinner fa-spin' : 'fa-search'} absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm`}></i>
                                            {clientSearch.results.length > 0 && (
                                                <ul className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-40 overflow-y-auto">
                                                    {clientSearch.results.map(item => (
                                                        <li key={item.id} onClick={() => selectItem('client', item)} className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0 font-bold text-[#1E3A8A] text-xs md:text-sm">{item.name}</li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                                    {/* بحث المحكمة */}
                                    <div className="relative">
                                        <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">المحكمة المختصة <span className="text-rose-500">*</span></label>
                                        {courtSearch.display ? (
                                            <div className="bg-emerald-50 border-2 border-emerald-200 p-3 rounded-xl flex items-center justify-between">
                                                <span className="text-xs md:text-sm font-bold text-emerald-800 truncate flex items-center gap-1.5"><i className="fas fa-check-circle text-emerald-500"></i>{courtSearch.display}</span>
                                                <button type="button" onClick={() => clearSelection('court')} className="text-rose-500 hover:bg-rose-100 w-7 h-7 rounded-lg transition-colors flex shrink-0 items-center justify-center"><i className="fas fa-times text-sm"></i></button>
                                            </div>
                                        ) : (
                                            <div className="relative">
                                                <input type="text" value={courtSearch.term} onChange={handleSearchCourt} placeholder="اسم المحكمة..." className="w-full p-3 md:p-3.5 pl-10 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none focus:border-[#D4AF37] font-bold text-xs md:text-sm text-[#1E3A8A]" />
                                                <i className={`fas ${courtSearch.isSearching ? 'fa-spinner fa-spin' : 'fa-search'} absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm`}></i>
                                                {courtSearch.results.length > 0 && (
                                                    <ul className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-40 overflow-y-auto">
                                                        {courtSearch.results.map(item => (
                                                            <li key={item.id} onClick={() => selectItem('court', item)} className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0 font-bold text-[#1E3A8A] text-xs md:text-sm">{item.name}</li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* بحث نوع القضية */}
                                    <div className="relative">
                                        <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">نوع القضية <span className="text-rose-500">*</span></label>
                                        {typeSearch.display ? (
                                            <div className="bg-emerald-50 border-2 border-emerald-200 p-3 rounded-xl flex items-center justify-between">
                                                <span className="text-xs md:text-sm font-bold text-emerald-800 truncate flex items-center gap-1.5"><i className="fas fa-check-circle text-emerald-500"></i>{typeSearch.display}</span>
                                                <button type="button" onClick={() => clearSelection('type')} className="text-rose-500 hover:bg-rose-100 w-7 h-7 rounded-lg transition-colors flex shrink-0 items-center justify-center"><i className="fas fa-times text-sm"></i></button>
                                            </div>
                                        ) : (
                                            <div className="relative">
                                                <input type="text" value={typeSearch.term} onChange={handleSearchType} placeholder="نوع القضية..." className="w-full p-3 md:p-3.5 pl-10 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none focus:border-[#D4AF37] font-bold text-xs md:text-sm text-[#1E3A8A]" />
                                                <i className={`fas ${typeSearch.isSearching ? 'fa-spinner fa-spin' : 'fa-search'} absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm`}></i>
                                                {typeSearch.results.length > 0 && (
                                                    <ul className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-40 overflow-y-auto">
                                                        {typeSearch.results.map(item => (
                                                            <li key={item.id} onClick={() => selectItem('type', item)} className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0 font-bold text-[#1E3A8A] text-xs md:text-sm">{item.name}</li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">الحالة الحالية للقضية</label>
                                    <div className="flex flex-wrap sm:flex-nowrap gap-2 md:gap-3 bg-slate-50 p-2 rounded-xl border-2 border-slate-100">
                                        {['متداولة', 'محجوزة للحكم', 'منتهية'].map(status => (
                                            <label key={status} className={`flex-1 min-w-[30%] text-center py-2 md:py-2.5 rounded-lg cursor-pointer text-[10px] md:text-xs font-bold transition-all ${formData.case_status === status ? 'bg-white text-[#1E3A8A] shadow-sm border border-[#D4AF37]' : 'text-slate-500 hover:bg-slate-200'}`}>
                                                <input type="radio" name="case_status" value={status} checked={formData.case_status === status} onChange={(e) => setFormData({...formData, case_status: e.target.value})} className="hidden" />
                                                {status}
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="pt-2">
                                    <button type="submit" disabled={isLoading || !formData.client_id || !formData.court_id || !formData.case_type_id} className="w-full bg-[#1E3A8A] hover:bg-blue-900 text-white font-black py-3.5 md:py-4 rounded-xl shadow-lg transition-all text-sm md:text-base flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                                        {isLoading ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-save"></i> {isEditing ? 'حفظ التعديلات' : 'حفظ القضية في الأرشيف'}</>}
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