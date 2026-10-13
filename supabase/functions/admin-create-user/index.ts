import { handleStaff } from '../_shared/staff-handler.ts'
Deno.serve(request => handleStaff(request, 'create'))
