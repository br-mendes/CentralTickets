/**
 * Supabase Cache Module
 * Hybrid loading: quick load from cache, then sync newest from GLPI
 */

const SupabaseCache = {
    supabase: null,
    isInitialized: false,

    init(supabaseUrl, supabaseKey) {
        if (this.isInitialized && this.supabase) return this.supabase;
        this.supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
        this.isInitialized = true;
        return this.supabase;
    },

    async getAllTickets(instance = null, limit = 2000) {
        if (!this.supabase) return [];

        try {
            let query = this.supabase
                .from('tickets_cache')
                .select('*')
                .order('date_mod', { ascending: false })
                .limit(limit);

            if (instance) {
                query = query.eq('instance', instance);
            }

            const { data, error } = await query;
            
            if (error) {
                console.error('Erro ao buscar tickets do Supabase:', error);
                return [];
            }

            return data || [];
        } catch (error) {
            console.error('Erro ao buscar tickets do Supabase:', error);
            return [];
        }
    },

    async getActiveTickets() {
        if (!this.supabase) return [];
        
        try {
            const { data, error } = await this.supabase
                .from('tickets_cache')
                .select('*')
                .not('status_key', 'in', '(solved,closed)')
                .order('date_mod', { ascending: false });

            if (error) {
                console.error('Erro ao buscar tickets ativos:', error);
                return [];
            }

            return data || [];
        } catch (error) {
            console.error('Erro ao buscar tickets ativos:', error);
            return [];
        }
    },

    async getWaitingTickets(hoursThreshold = 24) {
        if (!this.supabase) return [];
        
        try {
            const threshold = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000).toISOString();
            
            const { data, error } = await this.supabase
                .from('tickets_cache')
                .select('*')
                .not('status_key', 'in', '(solved,closed)')
                .lt('date_mod', threshold)
                .order('date_mod', { ascending: true });

            if (error) {
                console.error('Erro ao buscar tickets em espera:', error);
                return [];
            }

            return data || [];
        } catch (error) {
            console.error('Erro ao buscar tickets em espera:', error);
            return [];
        }
    },

    async getTicketsByPeriod(dateType, startDate, endDate, filters = {}) {
        if (!this.supabase) return [];
        
        try {
            let query = this.supabase
                .from('tickets_cache')
                .select('*')
                .gte(dateType === 'opening' ? 'date_created' : 'date_mod', startDate)
                .lte(dateType === 'opening' ? 'date_created' : 'date_mod', endDate)
                .order(dateType === 'opening' ? 'date_created' : 'date_mod', { ascending: false });

            if (filters.instance) {
                query = query.eq('instance', filters.instance);
            }
            if (filters.entity) {
                query = query.eq('entity', filters.entity);
            }
            if (filters.status) {
                query = query.eq('status_key', filters.status);
            }

            const { data, error } = await query;
            
            if (error) {
                console.error('Erro ao buscar tickets por período:', error);
                return [];
            }

            return data || [];
        } catch (error) {
            console.error('Erro ao buscar tickets por período:', error);
            return [];
        }
    },

    async getStats() {
        if (!this.supabase) return null;
        
        try {
            const { data, error } = await this.supabase
                .from('tickets_cache')
                .select('instance, status_key, is_sla_late, root_category, entity, group_name');

            if (error) throw error;

            const stats = {
                byInstance: {},
                byStatus: { new: 0, processing: 0, pending: 0, solved: 0, closed: 0 },
                slaLate: 0,
                byCategory: {},
                byEntity: {},
                byGroup: {},
                total: data.length
            };

            data.forEach(ticket => {
                // By Instance
                if (!stats.byInstance[ticket.instance]) {
                    stats.byInstance[ticket.instance] = { total: 0, byStatus: { ...stats.byStatus } };
                }
                stats.byInstance[ticket.instance].total++;
                if (ticket.status_key && stats.byInstance[ticket.instance].byStatus[ticket.status_key] !== undefined) {
                    stats.byInstance[ticket.instance].byStatus[ticket.status_key]++;
                }

                // By Status
                if (ticket.status_key && stats.byStatus[ticket.status_key] !== undefined) {
                    stats.byStatus[ticket.status_key]++;
                }

                // SLA Late
                if (ticket.is_sla_late) stats.slaLate++;

                // By Category
                if (ticket.root_category) {
                    stats.byCategory[ticket.root_category] = (stats.byCategory[ticket.root_category] || 0) + 1;
                }

                // By Entity
                if (ticket.entity) {
                    stats.byEntity[ticket.entity] = (stats.byEntity[ticket.entity] || 0) + 1;
                }

                // By Group
                if (ticket.group_name) {
                    stats.byGroup[ticket.group_name] = (stats.byGroup[ticket.group_name] || 0) + 1;
                }
            });

            return stats;
        } catch (error) {
            console.error('Erro ao buscar estatísticas:', error);
            return null;
        }
    },

    async getLastSync() {
        if (!this.supabase) return null;
        
        try {
            const { data, error } = await this.supabase
                .from('sync_control')
                .select('*')
                .order('last_sync', { ascending: false })
                .limit(1);

            if (error) throw error;
            return data?.[0] || null;
        } catch (error) {
            console.error('Erro ao buscar último sync:', error);
            return null;
        }
    },

    async upsertTicket(ticket) {
        if (!this.supabase) return null;
        
        try {
            const { data, error } = await this.supabase
                .from('tickets_cache')
                .upsert(ticket, { onConflict: 'ticket_id,instance' })
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Erro ao upsert ticket:', error);
            return null;
        }
    },

    async upsertTickets(tickets) {
        if (!this.supabase || !tickets.length) return null;
        
        try {
            const { data, error } = await this.supabase
                .from('tickets_cache')
                .upsert(tickets, { onConflict: 'ticket_id,instance' });

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Erro ao upsert tickets:', error);
            return null;
        }
    }
};

// GLPI Optimized Fetcher - only fetches newest tickets
const GLPIFetcher = {
    MAX_NEW_TICKETS: 200,

    async fetchNewestTickets(instanceConfig, sessionToken) {
        const tickets = [];
        let page = 0;
        const pageSize = 100;

        while (tickets.length < this.MAX_NEW_TICKETS) {
            const start = page * pageSize;
            const end = start + pageSize - 1;

            const searchParams = new URLSearchParams({
                'range': `${start}-${end}`,
                'expand_dropdowns': 'true',
                'get_hateoas': 'false',
                'sort': '2', // Sort by ID descending
                'order': 'DESC'
            });

            try {
                const response = await fetch(
                    `${instanceConfig.BASE_URL}/search/Ticket?${searchParams.toString()}`,
                    {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                            'Session-Token': sessionToken,
                            'App-Token': instanceConfig.APP_TOKEN,
                        },
                    }
                );

                if (!response.ok) {
                    if (response.status === 401) {
                        throw new Error('Sessão expirada');
                    }
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();
                if (!data.data || data.data.length === 0) break;

                tickets.push(...data.data);
                page++;

                if (page >= 50 || tickets.length >= this.MAX_NEW_TICKETS) break;
            } catch (error) {
                console.error('Erro ao buscar tickets GLPI:', error);
                throw error;
            }
        }

        return tickets.slice(0, this.MAX_NEW_TICKETS);
    },

    async fetchAllTickets(instanceConfig, sessionToken) {
        const tickets = [];
        let page = 0;
        const pageSize = 100;
        let hasMore = true;

        while (hasMore) {
            const start = page * pageSize;
            const end = start + pageSize - 1;

            const searchParams = new URLSearchParams({
                'range': `${start}-${end}`,
                'expand_dropdowns': 'true',
                'get_hateoas': 'false',
            });

            try {
                const response = await fetch(
                    `${instanceConfig.BASE_URL}/search/Ticket?${searchParams.toString()}`,
                    {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                            'Session-Token': sessionToken,
                            'App-Token': instanceConfig.APP_TOKEN,
                        },
                    }
                );

                if (!response.ok) {
                    if (response.status === 401) {
                        throw new Error('Sessão expirada');
                    }
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();
                if (!data.data || data.data.length === 0) {
                    hasMore = false;
                    break;
                }

                tickets.push(...data.data);
                page++;

                if (page >= 100) break; // Safety limit
            } catch (error) {
                console.error('Erro ao buscar tickets GLPI:', error);
                throw error;
            }
        }

        return tickets;
    }
};

// Hybrid Loader - combines Supabase cache + GLPI realtime
const HybridLoader = {
    async loadTickets(options = {}) {
        const {
            instances = ['Peta', 'GMX'],
            instanceConfigs = {},
            onProgress = () => {},
            useCache = true,
            glpiLimit = 200 // Only fetch newest X from GLPI
        } = options;

        const allTickets = [];
        const sources = { cache: [], glpi: [] };

        // Step 1: Load from cache (fast)
        if (useCache && SupabaseCache.supabase) {
            onProgress({ stage: 'cache', message: 'Carregando do cache...' });
            
            for (const instanceName of instances) {
                const cachedTickets = await SupabaseCache.getAllTickets(instanceName);
                sources.cache.push(...cachedTickets);
            }

            if (sources.cache.length > 0) {
                allTickets.push(...sources.cache.map(t => ({
                    ...t,
                    _source: 'cache'
                })));
                onProgress({ stage: 'cache', message: `${sources.cache.length} tickets do cache` });
            }
        }

        // Step 2: Fetch newest from GLPI (realtime)
        onProgress({ stage: 'glpi', message: 'Buscando tickets recentes do GLPI...' });

        for (const instanceName of instances) {
            const config = instanceConfigs[instanceName];
            if (!config) continue;

            try {
                // Init session
                const sessionResponse = await fetch(`${config.BASE_URL}/initSession`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `user_token ${config.USER_TOKEN}`,
                        'App-Token': config.APP_TOKEN,
                    },
                });

                if (!sessionResponse.ok) continue;
                const sessionData = await sessionResponse.json();
                const sessionToken = sessionData.session_token;

                // Fetch newest tickets
                const glpiTickets = await this.fetchNewestFromGLPI(config, sessionToken, glpiLimit);
                
                const processed = glpiTickets.map(t => this.processTicket(t, instanceName));
                sources.glpi.push(...processed);

                onProgress({ 
                    stage: 'glpi', 
                    message: `${instanceName}: ${processed.length} tickets do GLPI`,
                    count: sources.glpi.length
                });

            } catch (error) {
                console.error(`Erro ao buscar ${instanceName} do GLPI:`, error);
            }
        }

        // Step 3: Merge and deduplicate (GLPI wins for duplicates)
        const ticketMap = new Map();
        
        // First add cache tickets
        allTickets.forEach(t => {
            const key = `${t.ticket_id}-${t.instance}`;
            ticketMap.set(key, { ...t, _source: 'cache' });
        });

        // Then add/update with GLPI tickets (realtime takes precedence)
        sources.glpi.forEach(t => {
            const key = `${t.ticket_id}-${t.instance}`;
            ticketMap.set(key, { ...t, _source: 'glpi' });
        });

        const mergedTickets = Array.from(ticketMap.values());

        onProgress({ 
            stage: 'complete', 
            message: `${mergedTickets.length} tickets carregados`,
            cacheCount: sources.cache.length,
            glpiCount: sources.glpi.length
        });

        return {
            tickets: mergedTickets,
            sources,
            summary: {
                total: mergedTickets.length,
                fromCache: sources.cache.length,
                fromGlpi: sources.glpi.length
            }
        };
    },

    async fetchNewestFromGLPI(config, sessionToken, limit = 10000) {
        const tickets = [];
        let page = 0;
        const pageSize = 100;
        let hasMore = true;

        while (tickets.length < limit && hasMore) {
            const start = page * pageSize;
            const end = start + pageSize - 1;

            const searchParams = new URLSearchParams({
                'range': `${start}-${end}`,
                'expand_dropdowns': 'true',
                'get_hateoas': 'false',
            });

            try {
                const response = await fetch(
                    `${config.BASE_URL}/search/Ticket?${searchParams.toString()}`,
                    {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                            'Session-Token': sessionToken,
                            'App-Token': config.APP_TOKEN,
                        },
                    }
                );

                if (!response.ok) {
                    console.error(`Erro na busca: ${response.status}`);
                    break;
                }

                const data = await response.json();
                if (!data.data || data.data.length === 0) {
                    hasMore = false;
                    break;
                }

                tickets.push(...data.data);
                
                // Verificar se há mais dados
                if (data.data.length < pageSize || data.totalcount <= tickets.length) {
                    hasMore = false;
                }
                
                page++;
                
                // Limite de segurança (10000 tickets)
                if (page >= 100) {
                    hasMore = false;
                }
            } catch (error) {
                console.error('Erro ao buscar tickets:', error);
                break;
            }
        }

        console.log(`Total de tickets buscados: ${tickets.length}`);
        return tickets.slice(0, limit);
    },

    processTicket(rawTicket, instanceName) {
        const STATUS_MAP = {
            1: { key: 'new', name: 'Novo' },
            2: { key: 'processing', name: 'Em atendimento' },
            3: { key: 'processing', name: 'Em atendimento' },
            4: { key: 'pending', name: 'Pendente' },
            5: { key: 'solved', name: 'Solucionado' },
            6: { key: 'closed', name: 'Fechado' },
        };

        const statusId = parseInt(rawTicket[12]) || 1;
        const statusInfo = STATUS_MAP[statusId] || STATUS_MAP[1];

        const entityFull = rawTicket[80] || '';
        let entity = entityFull;
        if (instanceName === 'Peta') {
            entity = entityFull.replace(/^PETA\s*GRUPO\s*>\s*/gi, '').trim();
        } else if (instanceName === 'GMX') {
            entity = entityFull.replace(/^GMX\s*TECNOLOGIA\s*>\s*/gi, '').trim();
        }

        const category = rawTicket[7] || 'Não categorizado';
        const rootCategory = category.split(' > ')[0] || category;
        const dueDate = rawTicket[151];
        const isSlaLate = dueDate ? new Date(dueDate) < new Date() : false;
        const dateCreated = rawTicket.date_creation || rawTicket[15];
        const dateMod = rawTicket.date_mod || rawTicket[19] || rawTicket[91] || dateCreated;

        return {
            id: parseInt(rawTicket[2]) || rawTicket.id,
            ticket_id: parseInt(rawTicket[2]) || rawTicket.id,
            title: rawTicket[1] || 'Sem título',
            entity: entity || entityFull,
            entity_full: entityFull,
            category: category,
            root_category: rootCategory,
            status_id: statusId,
            status_key: statusInfo.key,
            status_name: statusInfo.name,
            group_name: rawTicket[8] || 'Não atribuído',
            date_created: dateCreated,
            date_mod: dateMod,
            due_date: dueDate,
            is_sla_late: isSlaLate,
            instance: instanceName,
            _source: 'glpi',
            _synced_at: new Date().toISOString()
        };
    }
};
