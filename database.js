// ============================================================================
// MentraLawyer Offline DB - Dexie.js Configuration & Queries (Global Version)
// ============================================================================

// 1. تهيئة قاعدة البيانات وجعلها عامة (Global) لجميع الصفحات
window.db = new Dexie("MentraLawyerLocalDB");

// 2. بناء هيكل الجداول (Schema)
window.db.version(1).stores({
    law_firms: '++id, name',
    branches: '++id, firm_id, is_main_branch',
    users: '++id, firm_id, email, role',
    user_branch_access: '++id, user_id, branch_id',
    
    clients: '++id, firm_id, name, phone, id_number',
    
    cases: '++id, firm_id, branch_id, client_id, case_type_id, court_id, case_number, case_status',
    case_documents: '++id, case_id',
    
    agenda_sessions: '++id, case_id, session_date, status',
    power_of_attorneys: '++id, client_id, expiry_date',
    
    client_payments: '++id, client_id, case_id, status',
    firm_expenses: '++id, branch_id, expense_date',
    
    global_case_types: '++id, name',
    global_courts: '++id, name'
});

// ============================================================================
// 3. دوال التهيئة الأولية (Seeding Initial Data)
// ============================================================================
window.initDatabase = async () => {
    const typesCount = await window.db.global_case_types.count();
    if (typesCount === 0) {
        await window.db.global_case_types.bulkAdd([
            { name: 'مدني', description: 'قضايا التعويضات، العقود' },
            { name: 'جنائي', description: 'قضايا الجنح والجنايات' },
            { name: 'أسرة', description: 'أحوال شخصية، نفقة، طلاق' },
            { name: 'مجلس دولة', description: 'قضايا إدارية' },
            { name: 'عمالي', description: 'نزاعات العمل' }
        ]);
    }

    const courtsCount = await window.db.global_courts.count();
    if (courtsCount === 0) {
        await window.db.global_courts.bulkAdd([
            { name: 'محكمة ابتدائية', degree: 'primary' },
            { name: 'محكمة استئناف', degree: 'appeal' },
            { name: 'محكمة النقض', degree: 'cassation' },
            { name: 'مجلس الدولة', degree: 'state_council' }
        ]);
    }
};

// ============================================================================
// 4. دوال إدارة المكاتب (Multi-Tenant Queries)
// ============================================================================
window.FirmQueries = {
    createFirm: async (firmName, ownerName, email, password) => {
        return await window.db.transaction('rw', window.db.law_firms, window.db.branches, window.db.users, window.db.user_branch_access, async () => {
            const firmId = await window.db.law_firms.add({
                name: firmName,
                owner_name: ownerName,
                created_at: new Date().toISOString()
            });

            const branchId = await window.db.branches.add({
                firm_id: firmId,
                branch_name: 'المقر الرئيسي',
                is_main_branch: 1
            });

            const userId = await window.db.users.add({
                firm_id: firmId,
                name: ownerName,
                email: email.toLowerCase(),
                password: password, 
                role: 'owner',
                is_active: 1
            });

            await window.db.user_branch_access.add({
                user_id: userId,
                branch_id: branchId
            });

            return { firmId, userId };
        });
    },

    login: async (email, password) => {
        const user = await window.db.users.where('email').equalsIgnoreCase(email).first();
        if (!user || user.password !== password) {
            throw new Error("بيانات الدخول غير صحيحة");
        }
        if (user.is_active === 0) {
            throw new Error("هذا الحساب موقوف");
        }
        const firm = await window.db.law_firms.get(user.firm_id);
        return { user, firm };
    }
};

// ============================================================================
// 5. دوال العملاء والقضايا (Clients & Cases)
// ============================================================================
window.LegalQueries = {
    getClientsByFirm: async (firmId) => {
        return await window.db.clients.where('firm_id').equals(firmId).reverse().toArray();
    },

    addClient: async (clientData) => {
        return await window.db.clients.add({ ...clientData, created_at: new Date().toISOString() });
    },

    getCasesByFirm: async (firmId) => {
        const cases = await window.db.cases.where('firm_id').equals(firmId).reverse().toArray();
        return Promise.all(cases.map(async (c) => {
            const client = await window.db.clients.get(c.client_id);
            const court = c.court_id ? await window.db.global_courts.get(c.court_id) : null;
            const type = c.case_type_id ? await window.db.global_case_types.get(c.case_type_id) : null;
            
            return {
                ...c,
                client_name: client ? client.name : 'غير محدد',
                court_name: court ? court.name : 'غير محدد',
                type_name: type ? type.name : 'غير محدد'
            };
        }));
    },

    addCase: async (caseData) => {
        return await window.db.cases.add({ ...caseData, created_at: new Date().toISOString() });
    }
};

// ============================================================================
// 6. دوال الأجندة (Agenda)
// ============================================================================
window.AgendaQueries = {
    getUpcomingSessions: async (firmId) => {
        const firmCases = await window.db.cases.where('firm_id').equals(firmId).toArray();
        const caseIds = firmCases.map(c => c.id);

        const today = new Date().toISOString().split('T')[0];
        const sessions = await window.db.agenda_sessions
            .where('case_id')
            .anyOf(caseIds)
            .filter(s => s.session_date >= today && s.status !== 'completed')
            .sortBy('session_date');

        return Promise.all(sessions.map(async (session) => {
            const caseInfo = firmCases.find(c => c.id === session.case_id);
            const client = await window.db.clients.get(caseInfo.client_id);
            return {
                ...session,
                case_number: caseInfo.case_number,
                opponent_name: caseInfo.opponent_name,
                client_name: client ? client.name : ''
            };
        }));
    },

    addSession: async (sessionData) => {
        return await window.db.agenda_sessions.add(sessionData);
    }
};

// ============================================================================
// 7. دوال الحسابات (Accounting)
// ============================================================================
window.AccountingQueries = {
    getFinancialSummary: async (firmId) => {
        const clients = await window.db.clients.where('firm_id').equals(firmId).toArray();
        const clientIds = clients.map(c => c.id);
        
        const payments = await window.db.client_payments.where('client_id').anyOf(clientIds).toArray();
        const totalRevenue = payments.reduce((sum, p) => sum + parseFloat(p.paid_amount || 0), 0);

        const branches = await window.db.branches.where('firm_id').equals(firmId).toArray();
        const branchIds = branches.map(b => b.id);
        
        const expenses = await window.db.firm_expenses.where('branch_id').anyOf(branchIds).toArray();
        const totalExpenses = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);

        return {
            totalRevenue,
            totalExpenses,
            netProfit: totalRevenue - totalExpenses
        };
    }
};