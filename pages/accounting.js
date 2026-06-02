// pages/accounting.js
const { useState, useEffect } = React;

window.Module_Accounting = function({ firmId, showToast }) {
    // ==========================================
    // 1. States الأساسية
    // ==========================================
    const [activeTab, setActiveTab] = useState('revenues'); 
    
    const [isRevModalOpen, setIsRevModalOpen] = useState(false);
    const [isExpModalOpen, setIsExpModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState('add');
    const [editId, setEditId] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0); 
    
    const getFirstDayOfMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]; };
    const getToday = () => new Date().toISOString().split('T')[0];

    const [filters, setFilters] = useState({ search: '', status: 'all', startDate: getFirstDayOfMonth(), endDate: getToday() });
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 5; 

    const [tableData, setTableData] = useState([]);
    const [totalFilteredItems, setTotalFilteredItems] = useState(0);
    const [stats, setStats] = useState({ totalCollected: 0, totalExpenses: 0, totalRemaining: 0, netProfit: 0 });

    const [revFormData, setRevFormData] = useState({ client_id: '', case_id: '', total_amount: '', paid_amount: '', payment_date: getToday(), notes: '' });
    const [expFormData, setExpFormData] = useState({ category: 'إيجار مقر', amount: '', expense_date: getToday(), notes: '' });

    const [clientSearch, setClientSearch] = useState({ term: '', results: [], isSearching: false, display: null });
    const [caseSearch, setCaseSearch] = useState({ term: '', results: [], isSearching: false, display: null });

    // ==========================================
    // 2. Data Fetching & Processing
    // ==========================================
    const dbTrigger = window.useLiveQuery(() => window.db.client_payments.count(), []);
    const branches = window.useLiveQuery(() => window.db.branches.where('firm_id').equals(firmId).toArray(), [firmId]) || [];
    const mainBranch = branches.length > 0 ? branches[0] : null;

    useEffect(() => {
        setTableData([]);
        setStats({ totalCollected: 0, totalExpenses: 0, totalRemaining: 0, netProfit: 0 });
        setCurrentPage(1);
    }, [firmId]);

    useEffect(() => {
        const processData = async () => {
            if (!window.db || !firmId) return;

            const firmClients = await window.db.clients.where('firm_id').equals(firmId).toArray();
            const firmClientIds = firmClients.map(c => c.id);

            let allRev = await window.db.client_payments.reverse().toArray();
            let rawRev = allRev.filter(r => firmClientIds.includes(r.client_id));

            let rawExp = [];
            if (mainBranch) {
                rawExp = await window.db.firm_expenses.where('branch_id').equals(mainBranch.id).reverse().toArray();
            }

            if (filters.startDate) {
                rawRev = rawRev.filter(r => (r.payment_date || '2000-01-01').substring(0, 10) >= filters.startDate);
                rawExp = rawExp.filter(e => (e.expense_date || '2000-01-01').substring(0, 10) >= filters.startDate);
            }
            if (filters.endDate) {
                rawRev = rawRev.filter(r => (r.payment_date || '2000-01-01').substring(0, 10) <= filters.endDate);
                rawExp = rawExp.filter(e => (e.expense_date || '2000-01-01').substring(0, 10) <= filters.endDate);
            }

            if (filters.status !== 'all') {
                rawRev = rawRev.filter(r => {
                    const remaining = (parseFloat(r.total_amount || 0) - parseFloat(r.paid_amount || 0));
                    return filters.status === 'خالص' ? remaining <= 0 : remaining > 0;
                });
            }

            if (filters.search) {
                const q = filters.search.toLowerCase();
                rawExp = rawExp.filter(e => (e.category || '').toLowerCase().includes(q) || ((e.notes || '').toLowerCase().includes(q)));
                
                const matchedClients = firmClients.filter(c => c.name.toLowerCase().includes(q));
                const clientIds = matchedClients.map(c => c.id);
                const matchedCases = await window.db.cases.where('firm_id').equals(firmId).filter(c => c.case_number.includes(q)).toArray();
                const caseIds = matchedCases.map(c => c.id);
                
                rawRev = rawRev.filter(r => clientIds.includes(r.client_id) || caseIds.includes(r.case_id));
            }

            const tCollected = rawRev.reduce((sum, r) => sum + (parseFloat(r.paid_amount) || 0), 0);
            const tRemaining = rawRev.reduce((sum, r) => sum + ((parseFloat(r.total_amount) || 0) - (parseFloat(r.paid_amount) || 0)), 0);
            const tExpenses = rawExp.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
            setStats({ totalCollected: tCollected, totalExpenses: tExpenses, totalRemaining: tRemaining, netProfit: tCollected - tExpenses });

            const activeDataRaw = activeTab === 'revenues' ? rawRev : rawExp;
            setTotalFilteredItems(activeDataRaw.length);

            const startIndex = (currentPage - 1) * itemsPerPage;
            const pagedRaw = activeDataRaw.slice(startIndex, startIndex + itemsPerPage);

            if (activeTab === 'revenues') {
                const enriched = await Promise.all(pagedRaw.map(async r => {
                    const client = firmClients.find(c => c.id === r.client_id); 
                    const caseObj = r.case_id ? await window.db.cases.get(r.case_id) : null;
                    return {
                        ...r,
                        client_name: client ? client.name : 'موكل محذوف',
                        case_number: caseObj ? caseObj.case_number : 'بدون قضية',
                        total: parseFloat(r.total_amount || 0),
                        paid: parseFloat(r.paid_amount || 0),
                        remaining: (parseFloat(r.total_amount || 0) - parseFloat(r.paid_amount || 0)),
                        safe_date: r.payment_date ? r.payment_date.substring(0, 10) : ''
                    };
                }));
                setTableData(enriched);
            } else {
                const enriched = pagedRaw.map(e => ({
                    ...e,
                    amount: parseFloat(e.amount || 0),
                    safe_date: e.expense_date ? e.expense_date.substring(0, 10) : ''
                }));
                setTableData(enriched);
            }

        };
        processData();
    }, [dbTrigger, refreshTrigger, activeTab, filters, currentPage, firmId, mainBranch]);

    const totalPages = Math.ceil(totalFilteredItems / itemsPerPage) || 1;
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(totalPages);

    // ==========================================
    // 3. التحكم في التبويبات 
    // ==========================================
    const switchTab = (tabName) => {
        if(activeTab === tabName) return;
        setTableData([]); 
        setCurrentPage(1);
        setActiveTab(tabName);
    };

    // ==========================================
    // 4. محركات البحث الذكية للإيرادات
    // ==========================================
    const handleSearchClient = async (e) => {
        const term = e.target.value;
        setClientSearch(prev => ({ ...prev, term }));
        if (!term.trim()) return setClientSearch(prev => ({ ...prev, results: [] }));
        
        setClientSearch(prev => ({ ...prev, isSearching: true }));
        const results = await window.db.clients.where('firm_id').equals(firmId).filter(c => c.name.includes(term)).limit(10).toArray();
        setClientSearch(prev => ({ ...prev, results, isSearching: false }));
    };

    const handleSearchCase = async (e) => {
        const term = e.target.value;
        setCaseSearch(prev => ({ ...prev, term }));
        if (!term.trim()) return setCaseSearch(prev => ({ ...prev, results: [] }));
        
        setCaseSearch(prev => ({ ...prev, isSearching: true }));
        const results = await window.db.cases.where('firm_id').equals(firmId)
            .filter(c => c.client_id === parseInt(revFormData.client_id) && c.case_number.includes(term))
            .limit(10).toArray();
        setCaseSearch(prev => ({ ...prev, results, isSearching: false }));
    };

    const selectClient = (item) => {
        setRevFormData({ ...revFormData, client_id: item.id, case_id: '' });
        setClientSearch({ term: '', results: [], isSearching: false, display: item.name });
        setCaseSearch({ term: '', results: [], isSearching: false, display: null }); 
    };

    const selectCase = (item) => {
        setRevFormData({ ...revFormData, case_id: item.id });
        setCaseSearch({ term: '', results: [], isSearching: false, display: `رقم القضية: ${item.case_number}` });
    };

    const clearClient = () => {
        setRevFormData({ ...revFormData, client_id: '', case_id: '' });
        setClientSearch(prev => ({ ...prev, display: null }));
        setCaseSearch(prev => ({ ...prev, display: null }));
    };

    const clearCase = () => {
        setRevFormData({ ...revFormData, case_id: '' });
        setCaseSearch(prev => ({ ...prev, display: null }));
    };

    // ==========================================
    // 5. معالجات الحفظ والحذف
    // ==========================================
    const handleFilterChange = (e) => {
        setFilters({ ...filters, [e.target.name]: e.target.value });
        setCurrentPage(1);
    };

    // --- الإيرادات ---
    const openAddRevModal = () => {
        setModalMode('add'); setEditId(null);
        setRevFormData({ client_id: '', case_id: '', total_amount: '', paid_amount: '', payment_date: getToday(), notes: '' });
        setClientSearch({ term: '', results: [], isSearching: false, display: null });
        setCaseSearch({ term: '', results: [], isSearching: false, display: null });
        setIsRevModalOpen(true);
    };

    const openEditRevModal = (payment) => {
        setModalMode('edit'); setEditId(payment.id);
        setRevFormData({
            client_id: payment.client_id, case_id: payment.case_id || '',
            total_amount: payment.total_amount, paid_amount: payment.paid_amount,
            payment_date: payment.payment_date, notes: payment.notes || ''
        });
        setClientSearch({ term: '', results: [], isSearching: false, display: payment.client_name });
        setCaseSearch({ term: '', results: [], isSearching: false, display: payment.case_id ? `رقم القضية: ${payment.case_number}` : null });
        setIsRevModalOpen(true);
    };

    const handleSaveRevenue = async (e) => {
        e.preventDefault();
        if (!revFormData.client_id) { showToast("الرجاء اختيار الموكل", "error"); return; }
        setIsLoading(true);
        try {
            const record = {
                client_id: parseInt(revFormData.client_id),
                case_id: revFormData.case_id ? parseInt(revFormData.case_id) : null,
                total_amount: parseFloat(revFormData.total_amount || 0),
                paid_amount: parseFloat(revFormData.paid_amount || 0),
                payment_date: revFormData.payment_date,
                notes: revFormData.notes,
                status: (parseFloat(revFormData.total_amount || 0) - parseFloat(revFormData.paid_amount || 0)) <= 0 ? 'completed' : 'pending'
            };
            if (modalMode === 'add') await window.db.client_payments.add(record);
            else await window.db.client_payments.update(editId, record);
            
            setRefreshTrigger(p => p + 1); 
            showToast("تم حفظ السجل المالي بنجاح", "success");
            setIsRevModalOpen(false);
        } catch (error) { showToast("حدث خطأ", "error"); } 
        finally { setIsLoading(false); }
    };

    const handleDeleteRev = async (id) => {
        if (confirm("هل أنت متأكد من حذف هذه الدفعة نهائياً؟")) {
            await window.db.client_payments.delete(id);
            if (tableData.length === 1 && currentPage > 1) setCurrentPage(p => p - 1);
            setRefreshTrigger(p => p + 1);
            showToast("تم الحذف بنجاح", "success");
        }
    };

    // --- المصروفات ---
    const openAddExpModal = () => {
        if(!mainBranch) { showToast("خطأ: يجب إعداد الفرع الرئيسي للمكتب أولاً", "error"); return; }
        setModalMode('add'); setEditId(null);
        setExpFormData({ category: 'إيجار مقر', amount: '', expense_date: getToday(), notes: '' });
        setIsExpModalOpen(true);
    };

    const openEditExpModal = (expense) => {
        setModalMode('edit'); setEditId(expense.id);
        setExpFormData({
            category: expense.category || 'أخرى', amount: expense.amount, 
            expense_date: expense.expense_date, notes: expense.notes || ''
        });
        setIsExpModalOpen(true);
    };

    const handleSaveExpense = async (e) => {
        e.preventDefault();
        if(!mainBranch) { showToast("خطأ: لم يتم العثور على فرع المكتب", "error"); return; }
        setIsLoading(true);
        try {
            const record = {
                branch_id: mainBranch.id,
                category: expFormData.category,
                amount: parseFloat(expFormData.amount || 0),
                expense_date: expFormData.expense_date,
                notes: expFormData.notes
            };
            if (modalMode === 'add') await window.db.firm_expenses.add(record);
            else await window.db.firm_expenses.update(editId, record);
            
            setRefreshTrigger(p => p + 1);
            showToast("تم حفظ المصروف بنجاح", "success");
            setIsExpModalOpen(false);
        } catch (error) { showToast("حدث خطأ", "error"); } 
        finally { setIsLoading(false); }
    };

    const handleDeleteExp = async (id) => {
        if (confirm("هل أنت متأكد من حذف هذا المصروف؟")) {
            await window.db.firm_expenses.delete(id);
            if (tableData.length === 1 && currentPage > 1) setCurrentPage(p => p - 1);
            setRefreshTrigger(p => p + 1);
            showToast("تم الحذف بنجاح", "success");
        }
    };

    return (
        <div className="space-y-6 animate-view pb-8">
            
            {/* ====== 1. الرأس وشريط الفلترة (محسن للموبايل) ====== */}
            <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm p-4 md:p-5">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 md:mb-6">
                    <h3 className="font-black text-lg md:text-xl text-[#1E3A8A] flex items-center gap-2">
                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><i className="fas fa-file-invoice-dollar"></i></div>
                        الماليات والتواريخ
                    </h3>
                    <div className="flex gap-2 w-full md:w-auto">
                        <button onClick={openAddRevModal} className="flex-1 md:flex-none bg-gradient-to-l from-emerald-600 to-emerald-700 hover:to-emerald-800 text-white px-3 md:px-5 py-2.5 md:py-3 rounded-xl md:rounded-2xl text-xs md:text-sm font-bold shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-1.5 active:scale-95">
                            <i className="fas fa-plus"></i> أتعاب
                        </button>
                        <button onClick={openAddExpModal} className="flex-1 md:flex-none bg-gradient-to-l from-rose-600 to-rose-700 hover:to-rose-800 text-white px-3 md:px-5 py-2.5 md:py-3 rounded-xl md:rounded-2xl text-xs md:text-sm font-bold shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-1.5 active:scale-95">
                            <i className="fas fa-minus"></i> مصروف
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-slate-100">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200">
                        <span className="text-[10px] md:text-xs font-bold text-slate-400 whitespace-nowrap">من:</span>
                        <input type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} className="bg-transparent text-xs md:text-sm font-bold text-[#1E3A8A] outline-none w-full" />
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200">
                        <span className="text-[10px] md:text-xs font-bold text-slate-400 whitespace-nowrap">إلى:</span>
                        <input type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} className="bg-transparent text-xs md:text-sm font-bold text-[#1E3A8A] outline-none w-full" />
                    </div>
                    <div className="relative col-span-1 sm:col-span-2">
                        <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                        <input type="text" name="search" value={filters.search} onChange={handleFilterChange} placeholder="بحث عام (اسم، رقم قضية، مصروف)..." className="w-full bg-white border border-slate-200 rounded-xl py-2.5 md:py-3 pr-10 pl-4 text-xs md:text-sm font-bold text-[#1E3A8A] outline-none focus:border-blue-500 transition" />
                    </div>
                </div>
            </div>

            {/* ====== 2. البطاقات الإحصائية ====== */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <div className="bg-emerald-50 p-4 md:p-5 rounded-2xl border border-emerald-100 shadow-sm flex flex-col justify-between text-center md:text-right">
                    <p className="text-[9px] md:text-[11px] font-bold text-emerald-600 mb-1">الإيرادات (المُحصّل)</p>
                    <h4 className="text-lg md:text-2xl font-black text-emerald-700 truncate" dir="ltr">{(stats.totalCollected).toLocaleString()} <span className="text-[10px] md:text-xs">ج.م</span></h4>
                </div>
                <div className="bg-rose-50 p-4 md:p-5 rounded-2xl border border-rose-100 shadow-sm flex flex-col justify-between text-center md:text-right">
                    <p className="text-[9px] md:text-[11px] font-bold text-rose-600 mb-1">المصروفات التشغيلية</p>
                    <h4 className="text-lg md:text-2xl font-black text-rose-700 truncate" dir="ltr">{(stats.totalExpenses).toLocaleString()} <span className="text-[10px] md:text-xs">ج.م</span></h4>
                </div>
                <div className={`p-4 md:p-5 rounded-2xl border shadow-sm flex flex-col justify-between text-center md:text-right ${stats.netProfit >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-orange-50 border-orange-100'}`}>
                    <p className={`text-[9px] md:text-[11px] font-bold mb-1 ${stats.netProfit >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>صافي الخزنة</p>
                    <h4 className={`text-lg md:text-2xl font-black truncate dir-ltr ${stats.netProfit >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>{(stats.netProfit).toLocaleString()} <span className="text-[10px] md:text-xs">ج.م</span></h4>
                </div>
                <div className="bg-slate-800 p-4 md:p-5 rounded-2xl border border-slate-700 shadow-sm relative overflow-hidden flex flex-col justify-between text-center md:text-right">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-white opacity-5 rounded-full -mr-8 -mt-8 pointer-events-none"></div>
                    <p className="text-[9px] md:text-[11px] font-bold text-slate-300 mb-1">مستحقات آجل (خارجية)</p>
                    <h4 className="text-lg md:text-2xl font-black text-[#D4AF37] truncate" dir="ltr">{(stats.totalRemaining).toLocaleString()} <span className="text-[10px] md:text-xs">ج.م</span></h4>
                </div>
            </div>

            {/* ====== 3. نظام التبويبات وعرض البيانات (بطاقات للموبايل / جدول للكمبيوتر) ====== */}
            <div className="bg-transparent md:bg-white rounded-none md:rounded-3xl border-none md:border md:border-slate-200 md:shadow-sm overflow-hidden flex flex-col">
                
                {/* التبويبات */}
                <div className="flex border-b border-slate-100 bg-white md:bg-slate-50 p-2 gap-2 overflow-x-auto hide-scrollbar rounded-2xl md:rounded-none mb-3 md:mb-0 shadow-sm md:shadow-none">
                    <button onClick={() => switchTab('revenues')} className={`flex-1 min-w-[140px] py-2.5 md:py-3 text-xs md:text-sm font-black rounded-xl transition-all flex items-center justify-center gap-1.5 ${activeTab === 'revenues' ? 'bg-emerald-50 text-emerald-700 shadow-sm border border-emerald-100' : 'text-slate-500 hover:text-slate-700 bg-slate-50'}`}>
                        <i className="fas fa-hand-holding-usd"></i> الإيرادات والأتعاب
                    </button>
                    <button onClick={() => switchTab('expenses')} className={`flex-1 min-w-[140px] py-2.5 md:py-3 text-xs md:text-sm font-black rounded-xl transition-all flex items-center justify-center gap-1.5 ${activeTab === 'expenses' ? 'bg-rose-50 text-rose-700 shadow-sm border border-rose-100' : 'text-slate-500 hover:text-slate-700 bg-slate-50'}`}>
                        <i className="fas fa-money-bill-wave"></i> مصروفات المكتب
                    </button>
                </div>

                {tableData.length === 0 ? (
                    <div className="py-16 md:py-20 text-center flex flex-col items-center bg-white rounded-2xl md:rounded-none border border-slate-200 md:border-none shadow-sm md:shadow-none">
                        <div className="w-16 h-16 md:w-20 md:h-20 bg-slate-50 rounded-full flex items-center justify-center mb-3 md:mb-4 text-3xl md:text-4xl text-slate-300"><i className="fas fa-receipt"></i></div>
                        <h3 className="font-black text-lg md:text-xl text-[#1E3A8A] mb-1">لا توجد سجلات</h3>
                        <p className="text-slate-400 font-bold text-xs md:text-sm">لم يتم العثور على حركات مالية في هذا النطاق.</p>
                    </div>
                ) : (
                    <>
                        {/* 📱 عرض الموبايل (Cards) */}
                        <div className="md:hidden flex flex-col gap-3">
                            {tableData.map((row) => (
                                <div key={row.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 relative overflow-hidden">
                                    {activeTab === 'revenues' ? (
                                        // بطاقة إيرادات
                                        <>
                                            <div className="flex justify-between items-start border-b border-slate-50 pb-3 mb-3">
                                                <div className="flex-1 overflow-hidden pr-2">
                                                    <div className="font-black text-[#1E3A8A] text-sm truncate">{row.client_name}</div>
                                                    <div className="text-[10px] text-slate-500 font-bold mt-1"><i className="fas fa-hashtag text-slate-400"></i> {row.case_number}</div>
                                                </div>
                                                <div className="text-left shrink-0">
                                                    <span className="text-[9px] text-slate-400 font-bold block mb-0.5">{row.safe_date}</span>
                                                </div>
                                            </div>
                                            
                                            <div className="grid grid-cols-3 gap-2 mb-4 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                                <div className="text-center">
                                                    <p className="text-[9px] font-bold text-slate-500 mb-0.5">الإجمالي</p>
                                                    <p className="text-xs font-black text-slate-700" dir="ltr">{(row.total || 0).toLocaleString()}</p>
                                                </div>
                                                <div className="text-center border-x border-slate-200">
                                                    <p className="text-[9px] font-bold text-emerald-600 mb-0.5">المدفوع</p>
                                                    <p className="text-xs font-black text-emerald-600" dir="ltr">{(row.paid || 0).toLocaleString()}</p>
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-[9px] font-bold text-rose-600 mb-0.5">الآجل</p>
                                                    <p className="text-xs font-black text-rose-600" dir="ltr">{(row.remaining || 0).toLocaleString()}</p>
                                                </div>
                                            </div>

                                            <div className="flex gap-2">
                                                <button onClick={() => openEditRevModal(row)} className="flex-1 bg-blue-50 text-blue-600 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 hover:bg-blue-500 hover:text-white transition-colors">
                                                    <i className="fas fa-pen"></i> تعديل
                                                </button>
                                                <button onClick={() => handleDeleteRev(row.id)} className="w-10 bg-rose-50 text-rose-600 py-2 rounded-xl flex items-center justify-center hover:bg-rose-500 hover:text-white transition-colors">
                                                    <i className="fas fa-trash text-xs"></i>
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        // بطاقة مصروفات
                                        <>
                                            <div className="flex justify-between items-start border-b border-slate-50 pb-3 mb-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-xs shrink-0"><i className="fas fa-bolt"></i></span>
                                                    <div>
                                                        <div className="font-black text-slate-700 text-sm">{row.category}</div>
                                                        <span className="text-[9px] text-slate-400 font-bold block mt-0.5">{row.safe_date}</span>
                                                    </div>
                                                </div>
                                                <div className="text-left shrink-0">
                                                    <span className="text-sm font-black text-rose-600 block" dir="ltr">{(row.amount || 0).toLocaleString()} <span className="text-[9px]">ج.م</span></span>
                                                </div>
                                            </div>
                                            
                                            {row.notes && (
                                                <div className="mb-4 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs font-bold text-slate-600">
                                                    <i className="fas fa-info-circle text-slate-400 ml-1"></i> {row.notes}
                                                </div>
                                            )}

                                            <div className="flex gap-2">
                                                <button onClick={() => openEditExpModal(row)} className="flex-1 bg-blue-50 text-blue-600 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 hover:bg-blue-500 hover:text-white transition-colors">
                                                    <i className="fas fa-pen"></i> تعديل
                                                </button>
                                                <button onClick={() => handleDeleteExp(row.id)} className="w-10 bg-rose-50 text-rose-600 py-2 rounded-xl flex items-center justify-center hover:bg-rose-500 hover:text-white transition-colors">
                                                    <i className="fas fa-trash text-xs"></i>
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* 💻 عرض الديسكتوب (Table) */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-right">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wider font-bold">
                                        {activeTab === 'revenues' ? (
                                            <>
                                                <th className="px-6 py-4">الموكل والقضية</th>
                                                <th className="px-6 py-4 text-center">إجمالي الأتعاب</th>
                                                <th className="px-6 py-4 text-center">المدفوع</th>
                                                <th className="px-6 py-4 text-center">الآجل</th>
                                                <th className="px-6 py-4">التاريخ</th>
                                            </>
                                        ) : (
                                            <>
                                                <th className="px-6 py-4">بند المصروف</th>
                                                <th className="px-6 py-4 text-center">المبلغ</th>
                                                <th className="px-6 py-4">التاريخ</th>
                                                <th className="px-6 py-4">ملاحظات</th>
                                            </>
                                        )}
                                        <th className="px-6 py-4 text-center">إجراءات</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {tableData.map((row) => (
                                        <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                                            {activeTab === 'revenues' ? (
                                                <>
                                                    <td className="px-6 py-4">
                                                        <div className="font-black text-[#1E3A8A] text-sm mb-1">{row.client_name}</div>
                                                        <div className="text-[10px] text-slate-500 font-bold"><i className="fas fa-hashtag"></i> {row.case_number}</div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center font-bold text-slate-700">{(row.total || 0).toLocaleString()}</td>
                                                    <td className="px-6 py-4 text-center font-black text-emerald-600">{(row.paid || 0).toLocaleString()}</td>
                                                    <td className="px-6 py-4 text-center font-black text-rose-500">{(row.remaining || 0).toLocaleString()}</td>
                                                    <td className="px-6 py-4 text-xs font-bold text-slate-500">{row.safe_date}</td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex justify-center gap-2">
                                                            <button onClick={() => openEditRevModal(row)} className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-500 hover:text-white transition-colors"><i className="fas fa-pen text-xs"></i></button>
                                                            <button onClick={() => handleDeleteRev(row.id)} className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-colors"><i className="fas fa-trash text-xs"></i></button>
                                                        </div>
                                                    </td>
                                                </>
                                            ) : (
                                                <>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-xs"><i className="fas fa-bolt"></i></span>
                                                            <span className="font-black text-slate-700">{row.category}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center font-black text-rose-600">{(row.amount || 0).toLocaleString()} ج.م</td>
                                                    <td className="px-6 py-4 text-xs font-bold text-slate-500">{row.safe_date}</td>
                                                    <td className="px-6 py-4 text-xs font-bold text-slate-600 max-w-[200px] truncate" title={row.notes}>{row.notes || '--'}</td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex justify-center gap-2">
                                                            <button onClick={() => openEditExpModal(row)} className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-500 hover:text-white transition-colors"><i className="fas fa-pen text-xs"></i></button>
                                                            <button onClick={() => handleDeleteExp(row.id)} className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-colors"><i className="fas fa-trash text-xs"></i></button>
                                                        </div>
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
                
                {/* Pagination */}
                {totalFilteredItems > itemsPerPage && (
                    <div className="p-3 md:p-4 mt-3 md:mt-0 border border-slate-200 md:border-t md:border-x-0 md:border-b-0 bg-white md:bg-slate-50 flex items-center justify-between rounded-2xl md:rounded-none shadow-sm md:shadow-none">
                        <p className="text-[11px] md:text-xs font-bold text-slate-500">صفحة {currentPage} من {totalPages}</p>
                        <div className="flex gap-1">
                            <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-[#1E3A8A] hover:text-white disabled:opacity-50 transition-colors"><i className="fas fa-chevron-right text-[10px] md:text-xs"></i></button>
                            <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-[#1E3A8A] hover:text-white disabled:opacity-50 transition-colors"><i className="fas fa-chevron-left text-[10px] md:text-xs"></i></button>
                        </div>
                    </div>
                )}
            </div>

            {/* ====== الإعلان الترويجي (الترقية للسحابة) ====== */}
            <div className="relative mt-8 bg-gradient-to-l from-[#1E3A8A] to-[#0F172A] rounded-2xl md:rounded-3xl p-5 md:p-8 text-white shadow-xl overflow-hidden border border-blue-800/50">
                <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-[#D4AF37] rounded-full blur-[70px] opacity-20 pointer-events-none"></div>
                
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-5 text-center md:text-right">
                    <div className="flex flex-col sm:flex-row items-center sm:items-start md:items-center gap-4 w-full">
                        <div className="w-14 h-14 shrink-0 bg-white/5 backdrop-blur-sm rounded-2xl flex items-center justify-center text-2xl border border-white/10 text-[#D4AF37]">
                            <i className="fas fa-file-invoice"></i>
                        </div>
                        <div>
                            <h4 className="font-black text-lg md:text-xl mb-1 text-white">تحتاج إصدار إيصالات مطبوعة؟</h4>
                            <p className="text-slate-300 text-xs md:text-sm font-semibold max-w-lg leading-relaxed">
                                النسخة المجانية توفر تسجيلاً للحسابات محلياً. الترقية لـ <strong className="text-[#D4AF37]">النسخة السحابية</strong> تمنحك إمكانية إصدار إيصالات دفع للموكلين وطباعة تقارير مالية مفصلة.
                            </p>
                        </div>
                    </div>
                    
                    <div className="w-full md:w-auto shrink-0">
                        <a href="https://wa.me/201211934816" target="_blank" rel="noopener noreferrer" className="w-full flex items-center justify-center gap-2 bg-[#D4AF37] hover:bg-yellow-500 text-[#1E3A8A] px-6 py-3.5 rounded-xl font-black text-sm transition-all active:scale-95 shadow-lg shadow-yellow-900/30">
                            <i className="fas fa-rocket text-lg"></i>
                            ترقية للنسخة السحابية
                        </a>
                    </div>
                </div>
            </div>

            {/* ====== 4. Modal: الإيرادات (محسن للموبايل) ====== */}
            {isRevModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-3 sm:p-4 animate-view">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[95vh] md:max-h-[90vh]">
                        <div className="bg-gradient-to-r from-emerald-600 to-teal-800 p-4 md:p-6 flex justify-between items-center shrink-0">
                            <h3 className="text-base md:text-xl font-black text-white flex items-center gap-2">
                                <i className={`fas ${modalMode === 'add' ? 'fa-plus-circle' : 'fa-pen'}`}></i> 
                                {modalMode === 'add' ? 'تسجيل أتعاب / إيراد' : 'تعديل السجل المالي'}
                            </h3>
                            <button onClick={() => setIsRevModalOpen(false)} className="text-white/50 hover:text-white transition text-lg bg-white/5 w-8 h-8 rounded-full flex items-center justify-center"><i className="fas fa-times"></i></button>
                        </div>
                        <div className="p-4 md:p-6 overflow-y-auto custom-scrollbar flex-1">
                            <form onSubmit={handleSaveRevenue} className="space-y-4 md:space-y-5">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                                    <div className="relative">
                                        <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">الموكل <span className="text-rose-500">*</span></label>
                                        {clientSearch.display ? (
                                            <div className="bg-emerald-50 border-2 border-emerald-200 p-2.5 md:p-3 rounded-xl flex items-center justify-between">
                                                <span className="text-xs md:text-sm font-bold text-emerald-800 flex items-center gap-1.5"><i className="fas fa-check-circle text-emerald-500"></i><span className="truncate">{clientSearch.display}</span></span>
                                                <button type="button" onClick={clearClient} className="text-rose-500 hover:bg-rose-100 w-7 h-7 rounded-lg flex items-center justify-center shrink-0"><i className="fas fa-times"></i></button>
                                            </div>
                                        ) : (
                                            <div className="relative">
                                                <input type="text" value={clientSearch.term} onChange={handleSearchClient} placeholder="ابحث باسم الموكل..." className="w-full p-2.5 md:p-3 pl-10 rounded-xl border-2 border-slate-100 outline-none focus:border-emerald-500 font-bold text-xs md:text-sm" />
                                                <i className={`fas ${clientSearch.isSearching ? 'fa-spinner fa-spin' : 'fa-search'} absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm`}></i>
                                                {clientSearch.results.length > 0 && (
                                                    <ul className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-40 overflow-y-auto">
                                                        {clientSearch.results.map(item => (
                                                            <li key={item.id} onClick={() => selectClient(item)} className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 text-xs md:text-sm font-bold text-[#1E3A8A]">{item.name}</li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="relative">
                                        <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">القضية (اختياري)</label>
                                        {caseSearch.display ? (
                                            <div className="bg-emerald-50 border-2 border-emerald-200 p-2.5 md:p-3 rounded-xl flex items-center justify-between">
                                                <span className="text-xs md:text-sm font-bold text-emerald-800 flex items-center gap-1.5"><i className="fas fa-check-circle text-emerald-500"></i><span className="truncate">{caseSearch.display}</span></span>
                                                <button type="button" onClick={clearCase} className="text-rose-500 hover:bg-rose-100 w-7 h-7 rounded-lg flex items-center justify-center shrink-0"><i className="fas fa-times"></i></button>
                                            </div>
                                        ) : (
                                            <div className="relative">
                                                <input type="text" value={caseSearch.term} onChange={handleSearchCase} disabled={!revFormData.client_id} placeholder={revFormData.client_id ? "ابحث برقم القضية..." : "اختر الموكل أولاً"} className="w-full p-2.5 md:p-3 pl-10 rounded-xl border-2 border-slate-100 outline-none focus:border-emerald-500 font-bold text-xs md:text-sm disabled:opacity-50 disabled:bg-slate-100" />
                                                <i className={`fas ${caseSearch.isSearching ? 'fa-spinner fa-spin' : 'fa-search'} absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm`}></i>
                                                {caseSearch.results.length > 0 && (
                                                    <ul className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-40 overflow-y-auto">
                                                        {caseSearch.results.map(c => (
                                                            <li key={c.id} onClick={() => selectCase(c)} className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 text-xs md:text-sm font-bold text-[#1E3A8A]">رقم: {c.case_number}</li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 md:gap-4 bg-emerald-50/50 p-3 md:p-4 rounded-xl border border-emerald-100">
                                    <div>
                                        <label className="block text-[11px] md:text-xs font-bold text-emerald-800 mb-1.5">إجمالي الأتعاب المتفق عليها</label>
                                        <input type="number" name="total_amount" value={revFormData.total_amount} onChange={(e) => setRevFormData({...revFormData, total_amount: e.target.value})} required min="0" placeholder="0" className="w-full p-2.5 md:p-3 rounded-xl border border-emerald-200 outline-none focus:border-emerald-500 font-black text-base md:text-lg dir-ltr text-right" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] md:text-xs font-bold text-emerald-600 mb-1.5">المدفوع الفعلي (بالخزنة)</label>
                                        <input type="number" name="paid_amount" value={revFormData.paid_amount} onChange={(e) => setRevFormData({...revFormData, paid_amount: e.target.value})} required min="0" placeholder="0" className="w-full p-2.5 md:p-3 rounded-xl border border-emerald-200 outline-none focus:border-emerald-500 font-black text-base md:text-lg text-emerald-600 dir-ltr text-right" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                                    <div>
                                        <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">تاريخ الدفع</label>
                                        <input type="date" name="payment_date" value={revFormData.payment_date} onChange={(e) => setRevFormData({...revFormData, payment_date: e.target.value})} required className="w-full p-2.5 md:p-3 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none focus:border-emerald-500 font-bold text-xs md:text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">ملاحظات وطريقة الدفع</label>
                                        <input type="text" name="notes" value={revFormData.notes} onChange={(e) => setRevFormData({...revFormData, notes: e.target.value})} placeholder="كاش، شيك، فودافون كاش..." className="w-full p-2.5 md:p-3 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none focus:border-emerald-500 font-bold text-xs md:text-sm" />
                                    </div>
                                </div>
                                <div className="pt-2">
                                    <button type="submit" disabled={isLoading || !revFormData.client_id} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 md:py-4 rounded-xl shadow-lg transition-colors disabled:opacity-50 text-sm md:text-base flex items-center justify-center gap-2">
                                        {isLoading ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-save"></i> {modalMode === 'add' ? 'تسجيل الإيراد' : 'تحديث السجل'}</>}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* ====== 5. Modal: مصروفات المكتب (محسن للموبايل) ====== */}
            {isExpModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-3 sm:p-4 animate-view">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 flex flex-col max-h-[95vh] md:max-h-[90vh]">
                        <div className="bg-gradient-to-r from-rose-600 to-red-800 p-4 md:p-6 flex justify-between items-center shrink-0">
                            <h3 className="text-base md:text-xl font-black text-white flex items-center gap-2">
                                <i className={`fas ${modalMode === 'add' ? 'fa-plus-circle' : 'fa-pen'}`}></i> 
                                {modalMode === 'add' ? 'تسجيل مصروف تشغيل' : 'تعديل المصروف'}
                            </h3>
                            <button onClick={() => setIsExpModalOpen(false)} className="text-white/50 hover:text-white transition text-lg bg-white/5 w-8 h-8 rounded-full flex items-center justify-center"><i className="fas fa-times"></i></button>
                        </div>
                        <div className="p-4 md:p-6 overflow-y-auto custom-scrollbar flex-1">
                            <form onSubmit={handleSaveExpense} className="space-y-4 md:space-y-5">
                                <div>
                                    <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">بند المصروف <span className="text-rose-500">*</span></label>
                                    <select name="category" value={expFormData.category} onChange={(e) => setExpFormData({...expFormData, category: e.target.value})} required className="w-full p-3 md:p-3.5 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none focus:border-rose-500 font-bold text-xs md:text-sm cursor-pointer">
                                        <option value="إيجار مقر">إيجار مقر المكتب</option>
                                        <option value="كهرباء وغاز ومياه">كهرباء وغاز ومرافق</option>
                                        <option value="بوفيه وضيافة">بوفيه وضيافة</option>
                                        <option value="انتقالات وسفر">انتقالات ومواصلات</option>
                                        <option value="رسوم محاكم ودمغات">رسوم محاكم ودمغات</option>
                                        <option value="أخرى">أخرى (يحدد في الملاحظات)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[11px] md:text-xs font-bold text-rose-800 mb-1.5">المبلغ المدفوع (ج.م) <span className="text-rose-500">*</span></label>
                                    <input type="number" name="amount" value={expFormData.amount} onChange={(e) => setExpFormData({...expFormData, amount: e.target.value})} required min="1" placeholder="0" className="w-full p-3 md:p-3.5 rounded-xl border border-rose-200 outline-none focus:border-rose-500 font-black text-lg md:text-xl text-rose-600 dir-ltr text-right" />
                                </div>
                                <div>
                                    <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">تاريخ المصروف <span className="text-rose-500">*</span></label>
                                    <input type="date" name="expense_date" value={expFormData.expense_date} onChange={(e) => setExpFormData({...expFormData, expense_date: e.target.value})} required className="w-full p-3 md:p-3.5 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none focus:border-rose-500 font-bold text-xs md:text-sm" />
                                </div>
                                <div>
                                    <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">البيان والتفاصيل</label>
                                    <input type="text" name="notes" value={expFormData.notes} onChange={(e) => setExpFormData({...expFormData, notes: e.target.value})} placeholder="تفاصيل المصروف للرجوع إليها..." className="w-full p-3 md:p-3.5 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none focus:border-rose-500 font-bold text-xs md:text-sm" />
                                </div>
                                <div className="pt-2">
                                    <button type="submit" disabled={isLoading} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-black py-3.5 md:py-4 rounded-xl shadow-lg transition-colors disabled:opacity-50 text-sm md:text-base flex items-center justify-center gap-2">
                                        {isLoading ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-save"></i> {modalMode === 'add' ? 'حفظ المصروف' : 'تحديث المصروف'}</>}
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