import { Module } from '@nestjs/common';

import { AuthModule } from '@/modules/auth/auth.module';
import { ProjectsController } from './projects.controller';
import { ProjectsRepository } from './projects.repository';
import { ProjectsService } from './projects.service';

@Module({
	imports: [AuthModule],
	controllers: [ProjectsController],
	providers: [ProjectsRepository, ProjectsService],
})
export class ProjectsModule {}
