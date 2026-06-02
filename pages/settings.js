// pages/settings.js
const { useState, useEffect } = React;

window.Module_Settings = function({ firmId, showToast }) {
    // ==========================================
    // 1. States (حالات المكون)
    // ==========================================
    const [activeTab, setActiveTab] = useState('profile'); // profile, storage, danger
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    
    // بيانات المكتب والمدير
    const [formData, setFormData] = useState({
        firmName: '',
        ownerName: '',
        email: '',
        password: ''
    });

    // بيانات مساحة التخزين (Storage API)
    const [storageInfo, setStorageInfo] = useState({ used: '0.00', total: '0.00', percent: 0, isSupported: true });

    // ==========================================
    // 2. جلب البيانات عند فتح الشاشة
    // ==========================================
    useEffect(() => {
        const loadSettingsData = async () => {
            try {
                const session = JSON.parse(localStorage.getItem('MentraLocal_Session'));
                const firm = await window.db.law_firms.get(firmId);
                const user = await window.db.users.get(session.user_id);
                
                if (firm && user) {
                    setFormData({
                        firmName: firm.name,
                        ownerName: user.name,
                        email: user.email,
                        password: user.password
                    });
                }

                if (navigator.storage && navigator.storage.estimate) {
                    const estimate = await navigator.storage.estimate();
                    const usedMB = (estimate.usage / (1024 * 1024)).toFixed(2);
                    const totalMB = (estimate.quota / (1024 * 1024)).toFixed(2);
                    const percent = estimate.quota ? ((estimate.usage / estimate.quota) * 100).toFixed(4) : 0;
                    
                    setStorageInfo({ used: usedMB, total: totalMB, percent, isSupported: true });
                } else {
                    setStorageInfo({ ...storageInfo, isSupported: false });
                }
            } catch (error) {
                console.error("خطأ في جلب الإعدادات", error);
            }
        };

        loadSettingsData();
    }, [firmId]);

    // ==========================================
    // 3. Handlers (التحكم والتعديل)
    // ==========================================
    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    // حفظ التعديلات
    const handleSaveChanges = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const session = JSON.parse(localStorage.getItem('MentraLocal_Session'));

            await window.db.law_firms.update(firmId, { name: formData.firmName });
            
            await window.db.users.update(session.user_id, {
                name: formData.ownerName,
                email: formData.email,
                password: formData.password
            });

            session.firm_name = formData.firmName;
            session.name = formData.ownerName;
            localStorage.setItem('MentraLocal_Session', JSON.stringify(session));

            showToast("تم تحديث بيانات المكتب بنجاح", "success");
            
            setTimeout(() => { window.location.reload(); }, 1500);

        } catch (error) {
            showToast("حدث خطأ أثناء التحديث", "error");
        } finally {
            setIsLoading(false);
        }
    };

    // النسخ الاحتياطي (Backup) 
    const handleBackup = async () => {
        try {
            showToast("جاري تجميع البيانات وتجهيز الملف...", "success");
            
            const clients = await window.db.clients.where('firm_id').equals(firmId).toArray();
            const clientIds = clients.map(c => c.id);

            const cases = await window.db.cases.where('firm_id').equals(firmId).toArray();
            const caseIds = cases.map(c => c.id);

            const branches = await window.db.branches.where('firm_id').equals(firmId).toArray();
            const branchIds = branches.map(b => b.id);

            const allSessions = await window.db.agenda_sessions.toArray();
            const sessions = allSessions.filter(s => caseIds.includes(s.case_id));

            const allDocuments = await window.db.case_documents.toArray();
            const documents = allDocuments.filter(d => caseIds.includes(d.case_id));

            const allPayments = await window.db.client_payments.toArray();
            const payments = allPayments.filter(p => clientIds.includes(p.client_id));

            const allExpenses = await window.db.firm_expenses.toArray();
            const expenses = allExpenses.filter(e => branchIds.includes(e.branch_id));

            const exportData = {
                clients, cases, sessions, documents, payments, expenses, branches
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `MentraBackup_${formData.firmName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showToast("تم تحميل النسخة الاحتياطية بأمان", "success");
        } catch (error) {
            console.error(error);
            showToast("خطأ أثناء استخراج البيانات", "error");
        }
    };

    // إعادة ضبط المصنع (مسح المكتب)
    const handleFactoryReset = async () => {
        const confirm1 = confirm("⚠️ تحذير خطير: هل أنت متأكد من مسح جميع بيانات المكتب، القضايا، الموكلين، والماليات؟");
        if (confirm1) {
            const confirm2 = confirm("هذا الإجراء لا يمكن التراجع عنه أبداً (إلا إذا كان لديك ملف نسخ احتياطي). هل تريد المتابعة؟");
            if (confirm2) {
                await window.db.delete();
                localStorage.removeItem('MentraLocal_Session');
                alert("تم تدمير البيانات بنجاح. سيتم توجيهك لشاشة الدخول.");
                window.location.replace('subscriptions.html');
            }
        }
    };

    return (
        <div className="space-y-6 animate-view max-w-5xl mx-auto pb-8">
            
            {/* ====== 1. الرأس (محسن للموبايل) ====== */}
            <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm p-4 md:p-6 flex flex-col md:flex-row gap-4 justify-between items-center relative overflow-hidden text-center md:text-right">
                <div className="absolute top-0 right-0 w-32 h-32 bg-slate-100 rounded-full blur-3xl opacity-50"></div>
                <div className="flex flex-col md:flex-row items-center gap-3 md:gap-4 relative z-10 w-full md:w-auto">
                    <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center text-xl md:text-2xl shadow-inner border border-slate-200">
                        <i className="fas fa-cog fa-spin-hover"></i>
                    </div>
                    <div>
                        <h3 className="font-black text-xl md:text-2xl text-[#1E3A8A]">إعدادات المكتب</h3>
                        <p className="text-[10px] md:text-xs font-bold text-slate-400 mt-1">إدارة بيانات المكتب، التخزين، والأمان</p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 md:gap-6">
                {/* ====== 2. القائمة الجانبية (تمرير أفقي للموبايل) ====== */}
                <div className="w-full md:w-64 shrink-0 flex flex-row md:flex-col gap-2 overflow-x-auto hide-scrollbar pb-1 md:pb-0 snap-x">
                    <button onClick={() => setActiveTab('profile')} className={`snap-center flex-1 md:flex-none flex justify-center md:justify-start items-center gap-2 md:gap-3 p-3 md:p-4 rounded-xl md:rounded-2xl font-bold text-xs md:text-sm transition-all whitespace-nowrap ${activeTab === 'profile' ? 'bg-[#1E3A8A] text-white shadow-lg shadow-blue-900/20' : 'bg-white text-slate-500 hover:bg-slate-100 border border-slate-200'}`}>
                        <i className="fas fa-building w-4 md:w-5 text-center"></i> بيانات المكتب
                    </button>
                    <button onClick={() => setActiveTab('storage')} className={`snap-center flex-1 md:flex-none flex justify-center md:justify-start items-center gap-2 md:gap-3 p-3 md:p-4 rounded-xl md:rounded-2xl font-bold text-xs md:text-sm transition-all whitespace-nowrap ${activeTab === 'storage' ? 'bg-[#1E3A8A] text-white shadow-lg shadow-blue-900/20' : 'bg-white text-slate-500 hover:bg-slate-100 border border-slate-200'}`}>
                        <i className="fas fa-database w-4 md:w-5 text-center"></i> التخزين والأمان
                    </button>
                    <button onClick={() => setActiveTab('danger')} className={`snap-center flex-1 md:flex-none flex justify-center md:justify-start items-center gap-2 md:gap-3 p-3 md:p-4 rounded-xl md:rounded-2xl font-bold text-xs md:text-sm transition-all whitespace-nowrap ${activeTab === 'danger' ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/20' : 'bg-white text-rose-500 hover:bg-rose-50 border border-rose-200'}`}>
                        <i className="fas fa-exclamation-triangle w-4 md:w-5 text-center"></i> منطقة الخطر
                    </button>
                </div>

                {/* ====== 3. محتوى الإعدادات ====== */}
                <div className="flex-1 bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    
                    {/* التبويب 1: بيانات المكتب */}
                    {activeTab === 'profile' && (
                        <div className="p-4 md:p-8 animate-view">
                            <h4 className="font-black text-base md:text-lg text-[#1E3A8A] mb-4 md:mb-6 border-b border-slate-100 pb-3 md:pb-4 flex items-center gap-2"><i className="fas fa-user-edit text-[#D4AF37]"></i> تحديث بيانات الملف الشخصي</h4>
                            
                            <form onSubmit={handleSaveChanges} className="space-y-4 md:space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                                    <div>
                                        <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5 md:mb-2">اسم مكتب المحاماة <span className="text-rose-500">*</span></label>
                                        <div className="relative">
                                            <i className="fas fa-building absolute right-3 md:right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                                            <input type="text" name="firmName" value={formData.firmName} onChange={handleInputChange} required className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl py-2.5 md:py-3 pr-9 md:pr-10 pl-4 text-xs md:text-sm font-bold text-[#1E3A8A] outline-none focus:border-[#D4AF37] focus:bg-white transition" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5 md:mb-2">اسم المدير (المحامي) <span className="text-rose-500">*</span></label>
                                        <div className="relative">
                                            <i className="fas fa-user-tie absolute right-3 md:right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                                            <input type="text" name="ownerName" value={formData.ownerName} onChange={handleInputChange} required className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl py-2.5 md:py-3 pr-9 md:pr-10 pl-4 text-xs md:text-sm font-bold text-[#1E3A8A] outline-none focus:border-[#D4AF37] focus:bg-white transition" />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                                    <div>
                                        <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5 md:mb-2">البريد الإلكتروني للولوج <span className="text-rose-500">*</span></label>
                                        <div className="relative">
                                            <i className="fas fa-envelope absolute right-3 md:right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                                            <input type="email" name="email" value={formData.email} onChange={handleInputChange} dir="ltr" required className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl py-2.5 md:py-3 pr-9 md:pr-10 pl-4 text-xs md:text-sm font-bold text-[#1E3A8A] outline-none focus:border-[#D4AF37] focus:bg-white transition text-left" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5 md:mb-2">كلمة المرور الحالية/الجديدة <span className="text-rose-500">*</span></label>
                                        <div className="relative">
                                            <i className="fas fa-lock absolute right-3 md:right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                                            <input type={showPassword ? "text" : "password"} name="password" value={formData.password} onChange={handleInputChange} dir="ltr" required className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl py-2.5 md:py-3 pr-9 md:pr-10 pl-10 md:pl-12 text-xs md:text-sm font-bold text-[#1E3A8A] outline-none focus:border-[#D4AF37] focus:bg-white transition text-left" />
                                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#1E3A8A] text-sm">
                                                <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-2 md:pt-4 border-t border-slate-100 flex justify-end">
                                    <button type="submit" disabled={isLoading} className="w-full md:w-auto bg-[#1E3A8A] hover:bg-blue-900 text-white font-black px-6 md:px-8 py-3.5 md:py-3 rounded-xl shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-70 text-sm md:text-base">
                                        {isLoading ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-save"></i> حفظ التحديثات</>}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* التبويب 2: التخزين والأمان (Backup) */}
                    {activeTab === 'storage' && (
                        <div className="p-4 md:p-8 animate-view space-y-6 md:space-y-8">
                            <h4 className="font-black text-base md:text-lg text-[#1E3A8A] mb-3 md:mb-4 border-b border-slate-100 pb-3 md:pb-4 flex items-center gap-2"><i className="fas fa-hdd text-[#D4AF37]"></i> مساحة التخزين المستخدمة (Offline)</h4>
                            
                            {storageInfo.isSupported ? (
                                <div className="bg-slate-50 p-4 md:p-6 rounded-2xl border border-slate-100 relative overflow-hidden">
                                    <i className="fas fa-database absolute -left-2 -bottom-2 md:-left-4 md:-bottom-4 text-6xl md:text-8xl text-slate-200 opacity-50"></i>
                                    <div className="relative z-10">
                                        <div className="flex justify-between items-end mb-3">
                                            <div>
                                                <p className="text-[10px] md:text-xs font-bold text-slate-500 mb-0.5 md:mb-1">بيانات محفوظة محلياً</p>
                                                <h3 className="text-2xl md:text-3xl font-black text-[#1E3A8A]">{storageInfo.used} <span className="text-xs md:text-sm">MB</span></h3>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] md:text-xs font-bold text-slate-400 mb-0.5 md:mb-1">مساحة جهازك المتاحة</p>
                                                <h3 className="text-lg md:text-xl font-bold text-slate-600">{storageInfo.total} <span className="text-[10px] md:text-xs">MB</span></h3>
                                            </div>
                                        </div>
                                        <div className="w-full bg-slate-200 rounded-full h-2 md:h-3 mb-2 overflow-hidden shadow-inner">
                                            <div className="bg-gradient-to-r from-emerald-400 to-emerald-600 h-2 md:h-3 rounded-full transition-all duration-1000" style={{ width: `${Math.max(storageInfo.percent, 1)}%` }}></div>
                                        </div>
                                        <p className="text-[9px] md:text-[10px] font-bold text-slate-400 flex items-start md:items-center gap-1">
                                            <i className="fas fa-info-circle text-emerald-500 mt-0.5 md:mt-0"></i> البيانات النصية تستهلك مساحة صغيرة جداً. جهازك قادر على استيعاب آلاف القضايا!
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-amber-50 p-3 md:p-4 rounded-xl border border-amber-200 text-amber-700 text-xs md:text-sm font-bold flex items-start md:items-center gap-2">
                                    <i className="fas fa-exclamation-triangle mt-0.5 md:mt-0"></i> متصفحك لا يدعم قراءة مساحة التخزين، ولكن بياناتك محفوظة بأمان.
                                </div>
                            )}

                            <div className="border-t border-slate-100 pt-6 md:pt-8">
                                <h4 className="font-black text-base md:text-lg text-[#1E3A8A] mb-3 md:mb-4 flex items-center gap-2"><i className="fas fa-cloud-download-alt text-[#D4AF37]"></i> استخراج نسخة احتياطية</h4>
                                <div className="flex flex-col gap-4 bg-blue-50 p-4 md:p-6 rounded-2xl border border-blue-100 text-center md:text-right">
                                    <div>
                                        <h5 className="font-black text-blue-900 mb-1.5 md:mb-2 text-sm md:text-base">أمان بياناتك بيدك</h5>
                                        <p className="text-[11px] md:text-xs font-bold text-blue-700 leading-relaxed mb-2">لتجنب ضياع مجهودك عند عمل "فورمات" للموبايل أو المتصفح، قم بتحميل هذا الملف واحتفظ به على Google Drive.</p>
                                        <p className="text-[9px] md:text-[10px] text-blue-500 font-bold"><i className="fas fa-shield-alt"></i> ملاحظة: الملف المستخرج لا يحتوي على كلمات المرور لحمايتك.</p>
                                    </div>
                                    <button onClick={handleBackup} className="w-full bg-[#1E3A8A] hover:bg-blue-900 text-white px-5 md:px-6 py-3.5 md:py-4 rounded-xl text-sm font-black shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-2 active:scale-95">
                                        <i className="fas fa-download text-base md:text-lg"></i> تحميل قاعدة البيانات
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* التبويب 3: منطقة الخطر */}
                    {activeTab === 'danger' && (
                        <div className="p-4 md:p-8 animate-view">
                            <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl md:rounded-3xl p-5 md:p-8 text-center relative overflow-hidden">
                                <i className="fas fa-skull-crossbones absolute -right-6 -bottom-6 md:-right-10 md:-bottom-10 text-7xl md:text-9xl text-rose-100 opacity-50"></i>
                                <div className="relative z-10">
                                    <div className="w-16 h-16 md:w-20 md:h-20 bg-white text-rose-600 rounded-full flex items-center justify-center text-3xl md:text-4xl shadow-lg mx-auto mb-4 md:mb-6">
                                        <i className="fas fa-radiation"></i>
                                    </div>
                                    <h3 className="font-black text-xl md:text-2xl text-rose-700 mb-2 md:mb-3">إعادة ضبط المصنع</h3>
                                    <p className="text-xs md:text-sm font-bold text-rose-600 max-w-lg mx-auto leading-relaxed mb-6 md:mb-8">
                                        هذا الزر سيقوم بمسح قاعدة البيانات من هذا المتصفح بشكل كامل ونهائي. سيتم مسح (المكتب، القضايا، الموكلين، والجلسات). لا تفعل ذلك إلا إذا أردت البدء من الصفر.
                                    </p>
                                    <button onClick={handleFactoryReset} className="w-full sm:w-auto bg-rose-600 hover:bg-rose-700 text-white font-black px-6 md:px-8 py-3.5 md:py-4 rounded-xl shadow-xl shadow-rose-600/30 transition-all flex items-center justify-center gap-2 mx-auto active:scale-95 text-xs md:text-sm">
                                        <i className="fas fa-trash-alt"></i> مسح جميع بيانات مكتبي نهائياً
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </div>

            {/* ====== الإعلان الترويجي (Ad Banner) ====== */}
            <div className="relative mt-8 bg-gradient-to-l from-slate-900 via-[#0B1120] to-[#1E3A8A] rounded-2xl md:rounded-3xl p-5 md:p-8 text-white shadow-xl overflow-hidden border border-blue-900/50">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4AF37] rounded-full blur-[60px] opacity-20 pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 w-40 h-40 bg-blue-500 rounded-full blur-[80px] opacity-20 pointer-events-none"></div>
                
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-5 text-center md:text-right">
                    <div className="flex flex-col sm:flex-row items-center sm:items-start md:items-center gap-4 w-full">
                        <div className="w-14 h-14 shrink-0 bg-white/5 backdrop-blur-sm rounded-2xl flex items-center justify-center text-3xl border border-white/10 text-[#D4AF37]">
                            <i className="fas fa-shield-alt"></i>
                        </div>
                        <div>
                            <h4 className="font-black text-lg md:text-xl mb-1 text-white">هل تنسى أخذ نسخة احتياطية؟</h4>
                            <p className="text-slate-400 text-xs md:text-sm font-semibold max-w-lg leading-relaxed">
                                في النسخة المجانية قد تفقد بياناتك إذا تم عمل "فورمات" لموبايلك. اشترك الآن في <strong className="text-white">النسخة السحابية (Cloud)</strong> واستمتع بنسخ احتياطي يومي تلقائي ومزامنة بين الموبايل والكمبيوتر بضمان 100%.
                            </p>
                        </div>
                    </div>
                    
                    <div className="w-full md:w-auto shrink-0 flex flex-col gap-2">
                        <a href="https://wa.me/201211934816" target="_blank" rel="noopener noreferrer" className="w-full bg-[#D4AF37] hover:bg-yellow-500 text-[#1E3A8A] px-6 py-3.5 rounded-xl font-black text-sm transition-all active:scale-95 shadow-lg shadow-yellow-900/20 flex items-center justify-center gap-2">
                            <i className="fab fa-whatsapp text-lg"></i>
                            تأمين مكتبي الآن
                        </a>
                    </div>
                </div>
            </div>

        </div>
    );
};